import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ZodSerializationException } from 'nestjs-zod'

import { Observable, throwError } from 'rxjs'
import { catchError, map } from 'rxjs/operators'

import { RESPONSE_MESSAGE_METADATA } from '../decorators/response-message.decorator'
import { SKIP_RESPONSE_INTERCEPTOR } from '../decorators/skip-response.decorator'

import { ErrorResponse, ResponseMessageProps, ResponseSuccess } from '../types/response.types'

import { ResponseCode } from '../constants/response.constant'

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ResponseSuccess<T>> {
  private readonly logger = new Logger(ResponseInterceptor.name)

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<ResponseSuccess<T>> {
    const skipInterceptor = this.reflector.getAllAndOverride<boolean>(SKIP_RESPONSE_INTERCEPTOR, [
      context.getHandler(),
      context.getClass(),
    ])

    if (skipInterceptor) {
      return next.handle()
    }

    return next.handle().pipe(
      map((res: unknown) => this.responseHandler(res, context)),
      catchError((err) => throwError(() => this.errorHandler(err, context))),
    )
  }

  errorHandler(exception, context: ExecutionContext) {
    const ctx = context.switchToHttp()

    const response = ctx.getResponse()
    const request = ctx.getRequest()

    let status = HttpStatus.INTERNAL_SERVER_ERROR as number
    let code = ResponseCode.INTERNAL_SERVER_ERROR as string

    let details
    if (exception.name === 'ZodValidationException') {
      const zodError = (exception as ZodSerializationException).getZodError()

      status = HttpStatus.BAD_REQUEST
      code = ResponseCode.VALIDATION_REQUEST_ERROR
      details = zodError.issues
    } else if (exception instanceof HttpException) {
      const responseBody = exception.getResponse()
      const httpError =
        typeof responseBody === 'object' ? (responseBody as Partial<ErrorResponse> & { statusCode?: number }) : {}

      status = httpError.status ?? httpError.statusCode ?? exception.getStatus()
      code = httpError.code ?? `HTTP_${status}`
      details = httpError.details ?? {}
    } else {
      details = {}
    }

    const { method, body, query, params } = request

    const message = exception.message
    const stack = process.env.NODE_ENV === 'dev' ? exception.stack : undefined

    const result: ErrorResponse = {
      success: false,
      code,
      status,
      message,
      details,
      stack,
    }
    this.logger.debug({ ...result, method, request: { body: this.redactSecrets(body), query, params } })

    response.status(status).json(result)
  }

  responseHandler(responseData, context: ExecutionContext) {
    const ctx = context.switchToHttp()

    const response = ctx.getResponse()
    const request = ctx.getRequest()

    const status = response.statusCode
    const metadata = this.reflector.get<ResponseMessageProps | undefined>(
      RESPONSE_MESSAGE_METADATA,
      context.getHandler(),
    )

    const code = metadata?.code ?? ResponseCode.SUCCESS
    const message = metadata?.message ?? ResponseCode.SUCCESS

    const { method, body, query, params } = request

    const result: ResponseSuccess<T> = {
      success: true,
      code,
      status,
      message,
      data: responseData,
    }
    this.logger.debug({ ...result, method, request: { body: this.redactSecrets(body), query, params } })

    return result
  }

  private redactSecrets(value: unknown): unknown {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value
    const sensitive = new Set(['password', 'password_hash', 'access_token', 'token'])
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        sensitive.has(key.toLowerCase()) ? '[REDACTED]' : item,
      ]),
    )
  }
}
