import { NestFactory, Reflector } from '@nestjs/core'
import { json, urlencoded } from 'express'
import { ZodValidationPipe } from 'nestjs-zod'
import { AppModule } from './app.module'
import { ResponseInterceptor } from './commons/serializers/response.serializer'
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js'
import {
  knowledgeOAuthProvider,
  getPendingAuthorization,
  deletePendingAuthorization,
  createAuthorizationCode,
  renderLoginForm,
} from './providers/oauth/oauth.provider'
import { AuthService } from './modules/auth/auth.service'
import { UserRepository } from './repository/schemas/user/user.repository'

export async function App() {
  const app = await NestFactory.create(AppModule)

  const httpAdapter = app.getHttpAdapter()
  httpAdapter.getInstance().set('trust proxy', 1)

  app.use(json({ limit: '25mb' }))
  app.use(urlencoded({ limit: '25mb', extended: true }))

  // OAuth router — required for MCP client auto-discovery and auth flow
  const issuerUrl = new URL(process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 3000}`)
  app.use(
    mcpAuthRouter({
      provider: knowledgeOAuthProvider,
      issuerUrl,
      scopesSupported: ['mcp'],
      resourceName: 'Knowledge Hub MCP Server',
    }),
  )

  const authService = app.get(AuthService)
  const userRepository = app.get(UserRepository)
  const expressApp = httpAdapter.getInstance()

  // OAuth login form submission — validates email + password
  expressApp.post('/oauth/login', async (req, res) => {
    const { nonce, email, password } = req.body as { nonce?: string; email?: string; password?: string }

    if (!nonce || !email || !password) {
      res.status(400).send(renderLoginForm('', 'Datos invalidos. Cierra esta ventana e intenta de nuevo.'))
      return
    }

    const pending = getPendingAuthorization(nonce)
    if (!pending) {
      res.status(400).send(renderLoginForm('', 'Sesion expirada. Cierra esta ventana e intenta de nuevo.'))
      return
    }

    try {
      // Validate credentials using AuthService
      await authService.login(email, password)
    } catch {
      res.send(renderLoginForm(nonce, 'Credenciales invalidas. Intenta de nuevo.'))
      return
    }

    // Credentials valid — resolve full user profile
    const user = await userRepository.findByEmailGlobal(email)
    if (!user) {
      res.send(renderLoginForm(nonce, 'Usuario no encontrado.'))
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

    console.log('[OAuth] login success:', email, '→ redirecting with code')
    res.redirect(redirectUrl.toString())
  })

  app.setGlobalPrefix('v1', { exclude: ['mcp'] })
  app.enableCors()
  app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)))
  app.useGlobalPipes(new ZodValidationPipe())
  app.enableShutdownHooks()

  return app
}
