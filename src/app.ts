import { NestFactory, Reflector } from '@nestjs/core'
import { json, urlencoded } from 'express'
import { ZodValidationPipe } from 'nestjs-zod'
import { AppModule } from './app.module'
import { ResponseInterceptor } from './commons/serializers/response.serializer'
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js'
import { simpleOAuthProvider, getEmailFromToken, handleOAuthLogin } from './providers/oauth/simple-oauth.provider'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { McpToolsController } from './tools'
import { TokenService } from './providers/token/token.service'

export async function App() {
  const app = await NestFactory.create(AppModule)

  const httpAdapter = app.getHttpAdapter()
  httpAdapter.getInstance().set('trust proxy', 1)

  app.use((req, res, next) => {
    console.log(
      `[REQ] ${req.method} ${req.url} | Auth: ${req.headers.authorization ? 'Bearer ...' + (req.headers.authorization as string).slice(-8) : 'none'}`,
    )
    next()
  })

  app.use(json({ limit: '25mb' }))
  app.use(urlencoded({ limit: '25mb', extended: true }))

  const issuerUrl = new URL(process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 3000}`)
  app.use(
    mcpAuthRouter({
      provider: simpleOAuthProvider,
      issuerUrl,
      scopesSupported: ['mcp'],
      resourceName: 'Knowledge Hub MCP Server',
    }),
  )

  const mcpTools = app.get(McpToolsController)
  const tokenService = app.get(TokenService)
  const expressApp = httpAdapter.getInstance()

  expressApp.post('/oauth/login', handleOAuthLogin)

  const sseTransports = new Map<string, SSEServerTransport>()

  expressApp.get('/sse', async (req, res) => {
    const authHeader = req.headers.authorization as string | undefined
    const oauthToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

    // Resolve email from OAuth token (issued by simpleOAuthProvider)
    const email = oauthToken ? getEmailFromToken(oauthToken) : null
    if (!email) {
      res.status(401).json({ error: 'Unauthorized: valid bearer token required' })
      return
    }

    // The KB token is carried in a dedicated header — separate from the OAuth token
    const kbToken = req.headers['x-kb-token'] as string | undefined
    if (!kbToken) {
      res.status(401).json({ error: 'Unauthorized: x-kb-token header required' })
      return
    }

    let userProfile
    try {
      userProfile = tokenService.extractFromToken(kbToken)
    } catch {
      res.status(401).json({ error: 'Unauthorized: invalid or expired KB token' })
      return
    }

    // Sanity check: OAuth email must match the token's email
    if (userProfile.email !== email) {
      res.status(403).json({ error: 'Forbidden: token email mismatch' })
      return
    }

    console.log('[MCP-SSE] Connection:', userProfile.email, '| tenant:', userProfile.tenant, '| role:', userProfile.role)

    const transport = new SSEServerTransport('/messages', res)
    sseTransports.set(transport.sessionId, transport)

    res.on('close', () => {
      sseTransports.delete(transport.sessionId)
    })

    const server = new McpServer({ name: 'knowledge-hub', version: '1.0.0' })
    mcpTools.register(server, userProfile)
    await server.connect(transport)
  })

  expressApp.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId as string
    const transport = sseTransports.get(sessionId)
    if (!transport) {
      res.status(400).json({ error: 'No transport found for sessionId' })
      return
    }
    await transport.handlePostMessage(req, res, req.body)
  })

  app.setGlobalPrefix('v1')
  app.enableCors()
  app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)))
  app.useGlobalPipes(new ZodValidationPipe())
  app.enableShutdownHooks()

  return app
}
