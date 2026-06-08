import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class NotificationSendFailedException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.CONFLICT, 'NOTIFICATION_SEND_FAILED', 'Notification send failed', details)
  }
}
