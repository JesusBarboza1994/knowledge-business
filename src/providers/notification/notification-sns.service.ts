import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { PublishCommand, SNSClient } from '@aws-sdk/client-sns'

import { AwsConfig } from '@/settings/settings.model'

import { NotificationSendFailedException } from '@/commons/exceptions/notification/notification-send-failed.exception'
import { NotificationUnauthorizedException } from '@/commons/exceptions/notification/notification-unauthorized.exception'

@Injectable()
export class NotificationSnsService {
  private readonly snsClient: SNSClient
  private readonly logger = new Logger(NotificationSnsService.name)

  constructor(private readonly configService: ConfigService) {
    const awsConfig = this.configService.get<AwsConfig>('aws')!

    this.snsClient = new SNSClient({
      region: awsConfig.region,
      credentials: {
        accessKeyId: awsConfig.accessKeyId,
        secretAccessKey: awsConfig.secretAccessKey,
      },
    })
  }

  async sendNotification({ message }: { message: string }) {
    const topicArn = this.configService.get('aws.snsArn')

    if (!topicArn) {
      throw new NotificationUnauthorizedException('topicArn environment variable is not defined.')
    }

    const command = new PublishCommand({
      TopicArn: topicArn,
      Message: message,
    })

    try {
      return await this.snsClient.send(command)
    } catch (error) {
      this.logger.error('Error al enviar la notificación a SNS:', error)
      throw new NotificationSendFailedException('Error al enviar la notificación a SNS.')
    }
  }
}
