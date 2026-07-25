import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class FailedMediaUploadException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.CONFLICT, 'FAILED_MEDIA_UPLOAD', 'Failed to upload media', details)
  }
}
