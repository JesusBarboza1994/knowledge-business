import { NestFactory, Reflector } from '@nestjs/core'
import { json, urlencoded } from 'express'
import { ZodValidationPipe } from 'nestjs-zod'
import { AppModule } from './app.module'
import { ResponseInterceptor } from './commons/serializers/response.serializer'
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js'
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  knowledgeOAuthProvider,
  getPendingAuthorization,
  deletePendingAuthorization,
  createAuthorizationCode,
} from './providers/oauth/oauth.provider'
import { renderError } from './providers/oauth/forms/errorPage'
import { renderSuccess } from './providers/oauth/forms/successPage'
import { McpToolsController } from './tools'
import { AuthService } from './modules/auth/auth.service'
import { UserRepository } from './repository/schemas/user/user.repository'

export async function App() {
  const app = await NestFactory.create(AppModule)

  const httpAdapter = app.getHttpAdapter()
  httpAdapter.getInstance().set('trust proxy', 1)

  app.use(json({ limit: '25mb' }))
  app.use(urlencoded({ limit: '25mb', extended: true }))

  // OAuth router — required for MCP client auto-discovery and auth flow
  // resourceServerUrl debe apuntar a /mcp para que la metadata path-aware
  // (/.well-known/oauth-protected-resource/mcp) ligue el token al recurso correcto.
  // Sin esto Claude autoriza pero no "encuentra" el server y vuelve a pedir auth.
  const issuerUrl = new URL(process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 3000}`)
  const mcpResourceUrl = new URL('/mcp', issuerUrl)
  app.use(
    mcpAuthRouter({
      provider: knowledgeOAuthProvider,
      issuerUrl,
      resourceServerUrl: mcpResourceUrl,
      scopesSupported: ['mcp'],
      resourceName: 'Knowledge Hub MCP Server',
    }),
  )

  const authService = app.get(AuthService)
  const userRepository = app.get(UserRepository)
  const expressApp = httpAdapter.getInstance()

  // --- MCP endpoint con requireBearerAuth ---
  // requireBearerAuth valida el token vía knowledgeOAuthProvider.verifyAccessToken
  // y deja la identidad en req.auth.extra. Responde 401 + WWW-Authenticate
  // (lo que dispara el flujo OAuth en Claude) si falta o es inválido.
  const mcpTools = app.get(McpToolsController)
  const bearerAuth = requireBearerAuth({
    verifier: knowledgeOAuthProvider,
    requiredScopes: ['mcp'],
    resourceMetadataUrl: new URL('/.well-known/oauth-protected-resource/mcp', issuerUrl).href,
  })

  expressApp.post('/mcp', bearerAuth, async (req, res) => {
    const extra = req.auth?.extra ?? {}
    const userProfile = {
      id: extra.id as string,
      email: extra.email as string,
      tenant: extra.tenant as string,
      areas: (extra.areas as string[]) ?? [],
      role: extra.role as string,
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

  // OAuth login form submission — validates email + password
  expressApp.post('/oauth/login', async (req, res) => {
    const { nonce, email, password } = req.body as { nonce?: string; email?: string; password?: string }

    if (!nonce || !email || !password) {
      res.status(400).send(renderError('Datos invalidos. Cierra esta ventana e intenta de nuevo.'))
      return
    }

    const pending = getPendingAuthorization(nonce)
    if (!pending) {
      res.status(400).send(renderError('Sesion expirada. Cierra esta ventana e intenta de nuevo.'))
      return
    }

    try {
      await authService.login(email, password)
    } catch {
      res.send(renderError('Credenciales invalidas. Intenta de nuevo.', nonce))
      return
    }

    const user = await userRepository.findByEmailGlobal(email)
    if (!user) {
      res.send(renderError('Usuario no encontrado.', nonce))
      return
    }

    deletePendingAuthorization(nonce)

    const { code, redirectUri, state } = createAuthorizationCode(pending, {
      id: user._id.toString(),
      email: user.email,
      tenant: user.tenant,
      areas: user.areas,
      role: user.role,
    })

    const redirectUrl = new URL(redirectUri)
    redirectUrl.searchParams.set('code', code)
    if (state) redirectUrl.searchParams.set('state', state)

    const finalUrl = redirectUrl.toString()
    console.log('[OAuth] login success:', email, '→ mostrando pantalla de exito')

    res.setHeader('Content-Type', 'text/html')
    res.send(renderSuccess(finalUrl))
  })

  app.setGlobalPrefix('v1')
  app.enableCors()
  app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)))
  app.useGlobalPipes(new ZodValidationPipe())
  app.enableShutdownHooks()

  return app
}
