import { HttpException } from '@nestjs/common'
import { ResponseCode } from '../constants/response.constant'
import { ErrorResponse } from '../types/response.types'

type ToolContent = { type: 'text'; text: string }

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

      const response: ToolSuccessResponse = {
        success: true,
        code: ResponseCode.SUCCESS,
        message: ResponseCode.SUCCESS,
        data,
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }],
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
