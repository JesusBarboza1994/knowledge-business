import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ConfigService } from '@nestjs/config'
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns'

import { NotificationSnsService } from './notification-sns.service'
import { NotificationSendFailedException } from '@/commons/exceptions/notification/notification-send-failed.exception'
import { NotificationUnauthorizedException } from '@/commons/exceptions/notification/notification-unauthorized.exception'

vi.mock('@aws-sdk/client-sns', () => ({
  SNSClient: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({ MessageId: 'mockMessageId' }),
  })),
  PublishCommand: vi.fn(),
}))

describe('NotificationSnsService', () => {
  let service: NotificationSnsService
  let configService: ConfigService
  let mockSnsClient: any

  beforeEach(() => {
    mockSnsClient = new SNSClient({})

    configService = {
      get: vi.fn().mockImplementation((key: string) => {
        if (key === 'aws.snsArn') return 'arn:aws:sns:us-east-1:123456789012:MyTopic'
        return {
          region: 'us-east-1',
          accessKeyId: 'testAccessKeyId',
          secretAccessKey: 'testSecretAccessKey',
        }
      }),
    } as unknown as ConfigService

    service = new NotificationSnsService(configService)
    ;(service as any).snsClient = mockSnsClient
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  it('should throw NotificationUnauthorizedException if snsArn is not defined', async () => {
    configService.get = vi.fn().mockReturnValueOnce(undefined)

    await expect(service.sendNotification({ message: 'Hello, World!' })).rejects.toThrow(
      NotificationUnauthorizedException,
    )
  })

  it('should send a notification with correct parameters', async () => {
    const message = 'Hello, World!'

    await service.sendNotification({ message })

    expect(mockSnsClient.send).toHaveBeenCalledWith(expect.any(PublishCommand))
    expect(PublishCommand).toHaveBeenCalledWith({
      TopicArn: 'arn:aws:sns:us-east-1:123456789012:MyTopic',
      Message: message,
    })
  })

  it('should throw NotificationSendFailedException on send error', async () => {
    mockSnsClient.send.mockRejectedValueOnce(new Error('Network error'))

    await expect(service.sendNotification({ message: 'Hello, World!' })).rejects.toThrow(
      NotificationSendFailedException,
    )
  })
})
