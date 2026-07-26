import { HttpException } from '@nestjs/common'
import { ResponseCode } from '../constants/response.constant'
import { ErrorResponse } from '../types/response.types'

type ToolContent = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }

/**
 * Returned by a handler whose payload is binary. The interceptor emits an MCP image block for it
 * instead of the usual JSON envelope — base64 inside a text block is just characters to the model,
 * while an image block is something it can actually look at. `meta` still travels as JSON so the
 * caller keeps the filename, dimensions and permissions context alongside the picture.
 */
export class ToolImage {
  constructor(
    readonly data: string,
    readonly mimeType: string,
    readonly meta?: unknown,
  ) {}
}

type ToolSuccessResponse = {
  success: true
  code: string
  message: string
  data: unknown
}

type ToolErrorResponse = {
  success: false
  code: string
  message: string
  details: unknown
}

type McpToolResult = {
  content: ToolContent[]
  isError?: boolean
}

export function withToolInterceptor(
  toolName: string,
  handler: (args: any) => Promise<unknown>,
): (args: any) => Promise<McpToolResult> {
  return async (args) => {
    try {
      const data = await handler(args)

      const envelope = (payload: unknown): ToolSuccessResponse => ({
        success: true,
        code: ResponseCode.SUCCESS,
        message: ResponseCode.SUCCESS,
        data: payload,
      })

      if (data instanceof ToolImage) {
        return {
          content: [
            { type: 'image' as const, data: data.data, mimeType: data.mimeType },
            { type: 'text' as const, text: JSON.stringify(envelope(data.meta), null, 2) },
          ],
        }
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(envelope(data), null, 2) }],
      }
    } catch (error) {
      let code: string = ResponseCode.INTERNAL_SERVER_ERROR
      let message = 'Unknown error'
      let details: unknown = { tool: toolName, args }

      if (error instanceof HttpException) {
        const httpError = error.getResponse() as ErrorResponse
        code = httpError.code
        message = httpError.message
        details = httpError.details ?? details
      } else if (error instanceof Error) {
        message = error.message
      }

      const response: ToolErrorResponse = {
        success: false,
        code,
        message,
        details,
      }

      console.error(`[MCP][${toolName}]`, message)

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }],
        isError: true,
      }
    }
  }
}
