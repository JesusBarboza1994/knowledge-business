import { Controller, Post, Req, Res, Logger } from '@nestjs/common'
import { Request, Response } from 'express'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { SkipResponse } from '@/commons/decorators/skip-response.decorator'
import { McpToolsController } from '@/tools'
import { UserProfile } from '@/tools/user-profile.type'
import { getUserFromToken } from '@/providers/oauth/oauth.provider'

interface McpSession {
  transport: StreamableHTTPServerTransport
  server: McpServer
  user: UserProfile
}

@SkipResponse()
@Controller('mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name)
  private readonly sessions = new Map<string, McpSession>()

  constructor(private readonly mcpTools: McpToolsController) {}

  @Post()
  async handlePost(@Req() req: Request, @Res() res: Response) {
    // Extract Bearer token (already validated by mcpAuthRouter middleware)
    const authHeader = req.headers.authorization as string | undefined
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

    if (!token) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const userProfile = getUserFromToken(token)
    if (!userProfile) {
      res.status(401).json({ error: 'Unauthorized: invalid token' })
      return
    }

    // Existing session
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    if (sessionId && this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId)!
      await session.transport.handleRequest(req, res, req.body)
      return
    }

    // New session
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    const server = new McpServer({ name: 'knowledge-hub', version: '1.0.0' })

    this.mcpTools.register(server, userProfile)
    await server.connect(transport)

    this.logger.log(`New MCP session | user: ${userProfile.email} | tenant: ${userProfile.tenant} | role: ${userProfile.role}`)

    await transport.handleRequest(req, res, req.body)
  }
}
