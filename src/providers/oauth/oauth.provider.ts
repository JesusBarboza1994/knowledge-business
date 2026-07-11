import { randomUUID } from 'crypto'
import { Response } from 'express'
import { OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js'
import { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js'
import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js'
import { OAuthClientInformationFull, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js'
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import { UserProfile } from '@/tools/user-profile.type'
import { TokenService } from '@/providers/token/token.service'
import { renderLoginForm } from './forms/loginPage'

const clients = new Map<string, OAuthClientInformationFull>()
const MCP_TOKEN_CLIENT_ID = 'knowledge-hub-token'

const codes = new Map<string, { clientId: string; codeChallenge: string; redirectUri: string; user: UserProfile }>()
const pendingAuthorizations = new Map<
  string,
  { clientId: string; codeChallenge: string; redirectUri: string; state?: string }
>()
let tokenService: TokenService | undefined

export function configureOAuthProvider(dependencies: { tokenService: TokenService }) {
  tokenService = dependencies.tokenService
}

function getTokenService(): TokenService {
  if (!tokenService) throw new Error('OAuth provider has not been configured with TokenService')
  return tokenService
}

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
  try {
    return getTokenService().extractFromToken(token)
  } catch {
    return undefined
  }
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

    const accessToken = getTokenService().generateToken(entry.user)
    const { expiresAt } = getTokenService().extractFromTokenWithExpiration(accessToken)
    console.log('[OAuth] token issued for:', entry.user.email)

    return {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: Math.max(0, expiresAt - Math.floor(Date.now() / 1000)),
    } as OAuthTokens
  },

  async exchangeRefreshToken() {
    throw new Error('Refresh tokens not supported')
  },

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    let tokenData: { user: UserProfile; expiresAt: number }
    try {
      tokenData = getTokenService().extractFromTokenWithExpiration(token)
    } catch {
      console.warn('[OAuth] invalid access token')
      throw new InvalidTokenError('Invalid access token')
    }

    console.log('[OAuth] verifyToken OK:', tokenData.user.email)
    return {
      token,
      clientId: MCP_TOKEN_CLIENT_ID,
      scopes: ['mcp'],
      expiresAt: tokenData.expiresAt,
      extra: {
        id: tokenData.user.id,
        email: tokenData.user.email,
        tenant: tokenData.user.tenant,
        memberships: tokenData.user.memberships,
        role: tokenData.user.role,
      },
    }
  },
}
