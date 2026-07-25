import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class ObjectNotFoundException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.NOT_FOUND, 'OBJECT_NOT_FOUND', 'Stored object not found', details)
  }
}
