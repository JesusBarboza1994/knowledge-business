import { INestApplication } from '@nestjs/common'
import { Express } from 'express'
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { knowledgeOAuthProvider } from '@/providers/oauth/oauth.provider'
import { McpToolsController } from '@/tools'
import { Membership, UserProfile } from '@/tools/user-profile.type'
import { UserRole } from '@/commons/enums'

/**
 * Mounts POST /mcp at the Express level (outside the `v1` prefix — MCP clients
 * expect the resource at the URL advertised in the OAuth metadata).
 *
 * requireBearerAuth validates the token via knowledgeOAuthProvider.verifyAccessToken
 * and leaves the identity in req.auth.extra. On a missing/invalid token it replies
 * 401 + WWW-Authenticate, which is what triggers the OAuth flow in MCP clients.
 *
 * Stateless Streamable HTTP: a fresh McpServer + transport per request
 * (sessionIdGenerator: undefined), with tools registered for the caller's profile.
 */
export function setupMcpEndpoint(app: INestApplication, issuerUrl: URL): void {
  const mcpTools = app.get(McpToolsController)
  const expressApp = app.getHttpAdapter().getInstance() as Express

  const bearerAuth = requireBearerAuth({
    verifier: knowledgeOAuthProvider,
    requiredScopes: ['mcp'],
    resourceMetadataUrl: new URL('/.well-known/oauth-protected-resource/mcp', issuerUrl).href,
  })

  expressApp.post('/mcp', bearerAuth, async (req, res) => {
    const extra = req.auth?.extra ?? {}
    const userProfile: UserProfile = {
      id: extra.id as string,
      email: extra.email as string,
      tenant: extra.tenant as string,
      memberships: (extra.memberships as Membership[]) ?? [],
      role: extra.role as UserRole,
    }
    console.log('[MCP] POST /mcp from:', userProfile.email, '| tenant:', userProfile.tenant)

    const server = new McpServer({ name: 'knowledge-hub', version: '1.0.0' })
    mcpTools.register(server, userProfile)

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    res.on('close', () => {
      transport.close()
      server.close()
    })

    try {
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
    } catch (err) {
      console.error('[MCP] error handling request:', err)
      if (!res.headersSent) res.status(500).json({ error: 'Internal server error' })
    }
  })
}
