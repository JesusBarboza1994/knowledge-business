import { HttpStatus, InternalServerErrorException } from '@nestjs/common'

export class AppException extends InternalServerErrorException {
  readonly code: HttpStatus

  constructor(status: number, code: string, message: string, details?: any) {
    super({
      success: false,
      status,
      message,
      code,
      details,
      stack: undefined,
    })
  }
}
