import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class UnauthorizedException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Unauthorized', details)
  }
}
