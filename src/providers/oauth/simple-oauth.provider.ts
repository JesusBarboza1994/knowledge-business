import { randomUUID } from 'crypto'
import { Request, Response } from 'express'
import { OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js'
import { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js'
import { OAuthClientInformationFull, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js'
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'

const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN ?? '@example.com'

// In-memory stores
const clients = new Map<string, OAuthClientInformationFull>()
const codes = new Map<string, { clientId: string; codeChallenge: string; redirectUri: string; email: string }>()
const tokens = new Map<string, { clientId: string; scopes: string[]; email: string }>()
const pendingAuthorizations = new Map<
  string,
  { clientId: string; codeChallenge: string; redirectUri: string; state?: string }
>()

const clientsStore: OAuthRegisteredClientsStore = {
  getClient(clientId: string) {
    console.log('[OAuth] getClient:', clientId)
    return clients.get(clientId)
  },
  registerClient(client) {
    const full: OAuthClientInformationFull = {
      ...client,
      client_id: randomUUID(),
      client_id_issued_at: Math.floor(Date.now() / 1000),
    }
    clients.set(full.client_id, full)
    console.log('[OAuth] registerClient:', full.client_id, full.client_name)
    return full
  },
}

function renderLoginForm(nonce: string, error?: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Knowledge Hub — Iniciar sesión</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f0f2f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); width: 100%; max-width: 380px; }
    .logo { font-size: 1.4rem; font-weight: 700; color: #1a1a1a; margin-bottom: 0.25rem; }
    .subtitle { color: #666; font-size: 0.9rem; margin-bottom: 1.5rem; }
    label { display: block; font-size: 0.85rem; font-weight: 500; color: #333; margin-bottom: 0.4rem; }
    input[type="email"] { width: 100%; padding: 0.65rem 0.85rem; border: 1.5px solid #ddd; border-radius: 8px; font-size: 0.95rem; outline: none; transition: border-color 0.15s; }
    input[type="email"]:focus { border-color: #4F46E5; }
    .error { background: #FEF2F2; color: #B91C1C; padding: 0.6rem 0.85rem; border-radius: 8px; font-size: 0.85rem; margin-bottom: 1rem; }
    button { width: 100%; padding: 0.7rem; background: #4F46E5; color: white; border: none; border-radius: 8px; font-size: 0.95rem; font-weight: 600; cursor: pointer; margin-top: 1rem; transition: background 0.15s; }
    button:hover { background: #4338CA; }
    .hint { color: #999; font-size: 0.8rem; margin-top: 1rem; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Knowledge Hub</div>
    <div class="subtitle">Ingresa con tu correo corporativo para conectar Claude</div>
    ${error ? `<div class="error">${error}</div>` : ''}
    <form method="POST" action="/oauth/login">
      <input type="hidden" name="nonce" value="${nonce}" />
      <label for="email">Correo electrónico</label>
      <input type="email" id="email" name="email" placeholder="usuario@example.com" required autofocus />
      <button type="submit">Continuar</button>
    </form>
    <div class="hint">Solo se permiten cuentas ${ALLOWED_DOMAIN}</div>
  </div>
</body>
</html>`
}

export const simpleOAuthProvider: OAuthServerProvider = {
  get clientsStore() {
    return clientsStore
  },

  async authorize(client, params, res: Response) {
    const nonce = randomUUID()
    pendingAuthorizations.set(nonce, {
      clientId: client.client_id,
      codeChallenge: params.codeChallenge,
      redirectUri: params.redirectUri,
      state: params.state,
    })
    console.log('[OAuth] authorize - showing login form, nonce:', nonce)
    res.setHeader('Content-Type', 'text/html')
    res.send(renderLoginForm(nonce))
  },

  async challengeForAuthorizationCode(_client, authorizationCode) {
    const entry = codes.get(authorizationCode)
    if (!entry) throw new Error('Invalid authorization code')
    return entry.codeChallenge
  },

  async exchangeAuthorizationCode(_client, authorizationCode) {
    const entry = codes.get(authorizationCode)
    if (!entry) throw new Error('Invalid authorization code')
    codes.delete(authorizationCode)

    const accessToken = randomUUID()
    tokens.set(accessToken, { clientId: entry.clientId, scopes: ['mcp'], email: entry.email })
    console.log('[OAuth] token issued for:', entry.email)

    return {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: 86400 * 30,
    } as OAuthTokens
  },

  async exchangeRefreshToken(_client, _refreshToken) {
    throw new Error('Refresh tokens not supported')
  },

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const entry = tokens.get(token)
    if (!entry) {
      console.log('[OAuth] verifyToken FAILED:', token)
      throw new Error('Invalid access token')
    }
    console.log('[OAuth] verifyToken OK:', entry.email)
    return {
      token,
      clientId: entry.clientId,
      scopes: entry.scopes,
    }
  },
}

export function getEmailFromToken(token: string): string | undefined {
  return tokens.get(token)?.email
}

export function handleOAuthLogin(req: Request, res: Response): void {
  const { nonce, email } = req.body as { nonce?: string; email?: string }

  if (!nonce || !email) {
    res.status(400).send(renderLoginForm('', 'Datos inválidos. Cierra esta ventana e intenta de nuevo.'))
    return
  }

  const pending = pendingAuthorizations.get(nonce)
  if (!pending) {
    res.status(400).send(renderLoginForm('', 'Sesión expirada. Cierra esta ventana e intenta de nuevo.'))
    return
  }

  if (!email.toLowerCase().endsWith(ALLOWED_DOMAIN)) {
    res.send(renderLoginForm(nonce, `Solo se permiten correos corporativos ${ALLOWED_DOMAIN}`))
    return
  }

  pendingAuthorizations.delete(nonce)

  const code = randomUUID()
  codes.set(code, {
    clientId: pending.clientId,
    codeChallenge: pending.codeChallenge,
    redirectUri: pending.redirectUri,
    email: email.toLowerCase(),
  })

  const redirectUrl = new URL(pending.redirectUri)
  redirectUrl.searchParams.set('code', code)
  if (pending.state) redirectUrl.searchParams.set('state', pending.state)

  console.log('[OAuth] login success:', email, '→ redirecting with code')
  res.redirect(redirectUrl.toString())
}
