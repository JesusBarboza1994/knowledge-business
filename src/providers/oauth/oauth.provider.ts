import { randomUUID } from 'crypto'
import { Response } from 'express'
import { OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js'
import { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js'
import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js'
import { OAuthClientInformationFull, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js'
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import { UserProfile } from '@/tools/user-profile.type'
import { TokenService } from '@/providers/token/token.service'
import { UserRepository } from '@/repository/schemas/user/user.repository'
import { isEmailVerified } from '@/repository/schemas/user/user.schema'
import { AreaAccess, UserRole, UserStatus } from '@/commons/enums'
import { renderLoginForm } from './forms/loginPage'

const clients = new Map<string, OAuthClientInformationFull>()
const MCP_TOKEN_CLIENT_ID = 'knowledge-hub-token'

const codes = new Map<string, { clientId: string; codeChallenge: string; redirectUri: string; user: UserProfile }>()
const pendingAuthorizations = new Map<
  string,
  { clientId: string; codeChallenge: string; redirectUri: string; state?: string }
>()
let tokenService: TokenService | undefined
let userRepository: UserRepository | undefined

export function configureOAuthProvider(dependencies: { tokenService: TokenService; userRepository: UserRepository }) {
  tokenService = dependencies.tokenService
  userRepository = dependencies.userRepository
}

function getUserRepository(): UserRepository {
  if (!userRepository) throw new Error('OAuth provider has not been configured with UserRepository')
  return userRepository
}

/**
 * The access token only proves who the caller was when Claude connected. Role, areas and status
 * are re-read here on every MCP request (one indexed lookup, same as SessionAuthGuard does for
 * the web), so revoking an area or deactivating someone takes effect on the next tool call
 * instead of when the 30-day token expires.
 */
export async function resolveCurrentProfile(claimed: UserProfile): Promise<UserProfile | undefined> {
  const current = await getUserRepository().findByIdGlobal(claimed.id)
  if (!current) return undefined
  if (current.status !== UserStatus.ACTIVE || !isEmailVerified(current)) return undefined
  if (current.tenant !== claimed.tenant || current.email !== claimed.email) return undefined
  return {
    id: current._id.toString(),
    email: current.email,
    name: current.name,
    tenant: current.tenant,
    role: current.role as UserRole,
    memberships: (current.memberships ?? []).map((membership) => ({
      area: membership.area,
      access: membership.access as AreaAccess,
    })),
  }
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

    // An invalid token makes the MCP client restart the OAuth flow, which is the right outcome
    // for a user who was deactivated or moved: they must sign in again to get access back.
    const current = await resolveCurrentProfile(tokenData.user)
    if (!current) {
      console.warn('[OAuth] token owner is no longer active:', tokenData.user.email)
      throw new InvalidTokenError('User is no longer active')
    }

    return {
      token,
      clientId: MCP_TOKEN_CLIENT_ID,
      scopes: ['mcp'],
      expiresAt: tokenData.expiresAt,
      extra: {
        id: current.id,
        email: current.email,
        tenant: current.tenant,
        memberships: current.memberships,
        role: current.role,
      },
    }
  },
}
