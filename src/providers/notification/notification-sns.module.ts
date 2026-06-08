import { Module } from '@nestjs/common'

import { NotificationSnsService } from './notification-sns.service'

@Module({
  providers: [NotificationSnsService],
  exports: [NotificationSnsService],
})
export class NotificationSnsModule {}
