import { randomUUID } from 'crypto'
import { Response } from 'express'
import { OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js'
import { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js'
import { OAuthClientInformationFull, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js'
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import { UserProfile } from '@/tools/user-profile.type'

const clients = new Map<string, OAuthClientInformationFull>()
const codes = new Map<string, { clientId: string; codeChallenge: string; redirectUri: string; user: UserProfile }>()
const tokens = new Map<string, { clientId: string; scopes: string[]; user: UserProfile }>()
const pendingAuthorizations = new Map<
  string,
  { clientId: string; codeChallenge: string; redirectUri: string; state?: string }
>()

const clientsStore: OAuthRegisteredClientsStore = {
  getClient(clientId: string) {
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

export function getPendingAuthorization(nonce: string) {
  return pendingAuthorizations.get(nonce)
}

export function deletePendingAuthorization(nonce: string) {
  pendingAuthorizations.delete(nonce)
}

export function createAuthorizationCode(
  pending: { clientId: string; codeChallenge: string; redirectUri: string; state?: string },
  user: UserProfile,
): { code: string; redirectUri: string; state?: string } {
  const code = randomUUID()
  codes.set(code, {
    clientId: pending.clientId,
    codeChallenge: pending.codeChallenge,
    redirectUri: pending.redirectUri,
    user,
  })
  return { code, redirectUri: pending.redirectUri, state: pending.state }
}

export function getUserFromToken(token: string): UserProfile | undefined {
  return tokens.get(token)?.user
}

function renderLoginForm(nonce: string, error?: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Knowledge Hub — Iniciar sesion</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #1e293b; padding: 2.5rem; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.3); width: 100%; max-width: 400px; }
    h1 { font-size: 1.5rem; font-weight: 700; color: #e2e8f0; margin-bottom: 0.25rem; }
    .subtitle { color: #94a3b8; font-size: 0.875rem; margin-bottom: 1.5rem; }
    label { display: block; font-size: 0.875rem; font-weight: 500; color: #cbd5e1; margin-bottom: 0.375rem; }
    input { width: 100%; padding: 0.625rem 0.75rem; border: 1px solid #334155; border-radius: 8px; background: #0f172a; color: #e2e8f0; font-size: 0.875rem; outline: none; margin-bottom: 1rem; }
    input:focus { border-color: #6366f1; }
    .error { background: #7f1d1d; color: #fca5a5; padding: 0.75rem; border-radius: 8px; font-size: 0.875rem; margin-bottom: 1rem; }
    button { width: 100%; padding: 0.625rem; background: #6366f1; color: white; border: none; border-radius: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer; }
    button:hover { background: #4f46e5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Knowledge Hub</h1>
    <div class="subtitle">Inicia sesion para conectar tu cliente MCP.</div>
    ${error ? `<div class="error">${error}</div>` : ''}
    <form method="POST" action="/oauth/login">
      <input type="hidden" name="nonce" value="${nonce}" />
      <label for="email">Correo</label>
      <input type="email" id="email" name="email" required placeholder="tu@empresa.com" autofocus />
      <label for="password">Contrasena</label>
      <input type="password" id="password" name="password" required />
      <button type="submit">Iniciar sesion</button>
    </form>
  </div>
</body>
</html>`
}

export { renderLoginForm }

export const knowledgeOAuthProvider: OAuthServerProvider = {
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
    tokens.set(accessToken, { clientId: entry.clientId, scopes: ['mcp'], user: entry.user })
    console.log('[OAuth] token issued for:', entry.user.email)

    return {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: 86400 * 30,
    } as OAuthTokens
  },

  async exchangeRefreshToken() {
    throw new Error('Refresh tokens not supported')
  },

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const entry = tokens.get(token)
    if (!entry) throw new Error('Invalid access token')
    console.log('[OAuth] verifyToken OK:', entry.user.email)
    return {
      token,
      clientId: entry.clientId,
      scopes: entry.scopes,
    }
  },
}
