import { randomUUID } from 'crypto'
import { Response } from 'express'
import { OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js'
import { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js'
import { OAuthClientInformationFull, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js'
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import { UserProfile } from '@/tools/user-profile.type'
import { renderLoginForm } from './forms/loginPage'

const clients = new Map<string, OAuthClientInformationFull>()
const TOKEN_TTL_MS = 86400 * 30 * 1000 // 30 days

const codes = new Map<string, { clientId: string; codeChallenge: string; redirectUri: string; user: UserProfile }>()
const tokens = new Map<string, { clientId: string; scopes: string[]; user: UserProfile; expiresAt: number }>()
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
    const expiresAt = Date.now() + TOKEN_TTL_MS
    tokens.set(accessToken, { clientId: entry.clientId, scopes: ['mcp'], user: entry.user, expiresAt })
    console.log('[OAuth] token issued for:', entry.user.email)

    return {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: Math.floor(TOKEN_TTL_MS / 1000),
    } as OAuthTokens
  },

  async exchangeRefreshToken() {
    throw new Error('Refresh tokens not supported')
  },

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const entry = tokens.get(token)
    if (!entry) throw new Error('Invalid access token')
    if (entry.expiresAt < Date.now()) {
      tokens.delete(token)
      throw new Error('Access token expired')
    }
    console.log('[OAuth] verifyToken OK:', entry.user.email)
    return {
      token,
      clientId: entry.clientId,
      scopes: entry.scopes,
      expiresAt: Math.floor(entry.expiresAt / 1000),
      extra: {
        id: entry.user.id,
        email: entry.user.email,
        tenant: entry.user.tenant,
        areas: entry.user.areas,
        role: entry.user.role,
      },
    }
  },
}
