import { NestFactory, Reflector } from '@nestjs/core'
import { json, urlencoded } from 'express'
import { ZodValidationPipe } from 'nestjs-zod'
import { AppModule } from './app.module'
import { ResponseInterceptor } from './commons/serializers/response.serializer'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { McpToolsController } from './tools'
import { TokenService } from './providers/token/token.service'

export async function App() {
  const app = await NestFactory.create(AppModule)

  const httpAdapter = app.getHttpAdapter()
  httpAdapter.getInstance().set('trust proxy', 1)

  app.use(json({ limit: '25mb' }))
  app.use(urlencoded({ limit: '25mb', extended: true }))

  const mcpTools = app.get(McpToolsController)
  const tokenService = app.get(TokenService)
  const expressApp = httpAdapter.getInstance()

  const sseTransports = new Map<string, SSEServerTransport>()

  // SSE endpoint — identity resolved entirely from the KB token in the Authorization header
  expressApp.get('/sse', async (req, res) => {
    const authHeader = req.headers.authorization as string | undefined
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

    if (!token) {
      res.status(401).json({ error: 'Unauthorized: Bearer token required' })
      return
    }

    let userProfile
    try {
      userProfile = tokenService.extractFromToken(token)
    } catch {
      res.status(401).json({ error: 'Unauthorized: invalid or expired token' })
      return
    }

    console.log('[MCP-SSE] Connection:', userProfile.email, '| tenant:', userProfile.tenant, '| role:', userProfile.role)

    const transport = new SSEServerTransport('/messages', res)
    sseTransports.set(transport.sessionId, transport)
    res.on('close', () => sseTransports.delete(transport.sessionId))

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
