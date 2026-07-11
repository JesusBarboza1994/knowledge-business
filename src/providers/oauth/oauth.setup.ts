import { INestApplication } from '@nestjs/common'
import { Express } from 'express'
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js'
import { configureOAuthProvider, knowledgeOAuthProvider } from './oauth.provider'
import { renderError } from './forms/errorPage'
import { renderSuccess } from './forms/successPage'
import { OAuthLoginService } from '@/modules/auth/oauth-login.service'
import { TokenService } from '@/providers/token/token.service'

const ERROR_PAGES: Record<string, { status: number; message: string; keepNonce: boolean }> = {
  invalid_data: { status: 400, message: 'Datos invalidos. Cierra esta ventana e intenta de nuevo.', keepNonce: false },
  expired: { status: 400, message: 'Sesion expirada. Cierra esta ventana e intenta de nuevo.', keepNonce: false },
  invalid_credentials: { status: 200, message: 'Credenciales invalidas. Intenta de nuevo.', keepNonce: true },
  user_not_found: { status: 200, message: 'Usuario no encontrado.', keepNonce: true },
}

/**
 * Mounts the OAuth surface at the Express level, outside the `v1` global prefix
 * and Nest pipes (the MCP SDK router owns its own routes):
 * - mcpAuthRouter: /.well-known metadata, /authorize, /token, /register —
 *   required for MCP client auto-discovery. resourceServerUrl must point to /mcp
 *   so the path-aware metadata ties the token to the right resource; without it
 *   Claude authorizes but keeps re-asking for auth.
 * - POST /oauth/login: the login form submission (form rendered by
 *   knowledgeOAuthProvider.authorize).
 */
export function setupOAuth(app: INestApplication, issuerUrl: URL): void {
  configureOAuthProvider({ tokenService: app.get(TokenService) })

  app.use(
    mcpAuthRouter({
      provider: knowledgeOAuthProvider,
      issuerUrl,
      resourceServerUrl: new URL('/mcp', issuerUrl),
      scopesSupported: ['mcp'],
      resourceName: 'Knowledge Hub MCP Server',
    }),
  )

  const oauthLoginService = app.get(OAuthLoginService)
  const expressApp = app.getHttpAdapter().getInstance() as Express

  expressApp.post('/oauth/login', async (req, res) => {
    const { nonce, email, password } = req.body as { nonce?: string; email?: string; password?: string }
    const result = await oauthLoginService.completeAuthorization(nonce, email, password)

    if (!result.ok) {
      const page = ERROR_PAGES[result.reason]
      res.status(page.status).send(renderError(page.message, page.keepNonce ? nonce : undefined))
      return
    }

    res.setHeader('Content-Type', 'text/html')
    res.send(renderSuccess(result.redirectUrl))
  })
}
