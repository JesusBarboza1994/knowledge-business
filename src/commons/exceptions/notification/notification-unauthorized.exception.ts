import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class NotificationUnauthorizedException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.UNAUTHORIZED, 'NOTIFICATION_UNAUTHORIZED', 'Notification unauthorized', details)
  }
}
