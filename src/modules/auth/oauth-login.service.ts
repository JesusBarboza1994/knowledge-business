import { HttpException, Injectable } from '@nestjs/common'
import { ErrorCode } from '@/commons/constants/error-code.constant'
import { UserRepository } from '@/repository/schemas/user/user.repository'
import { AreaAccess, UserRole } from '@/commons/enums'
import {
  getPendingAuthorization,
  deletePendingAuthorization,
  createAuthorizationCode,
} from '@/providers/oauth/oauth.provider'
import { AuthService } from './auth.service'

export type OAuthLoginResult =
  | { ok: true; redirectUrl: string }
  | {
      ok: false
      reason: 'invalid_data' | 'expired' | 'invalid_credentials' | 'user_not_found' | 'email_not_verified'
    }

/**
 * Business logic for the OAuth login form submission: validates the pending
 * authorization (nonce) and the user's credentials, then issues the
 * authorization code and builds the final redirect URL. No HTTP/HTML here —
 * the route handler maps results to pages.
 */
@Injectable()
export class OAuthLoginService {
  constructor(
    private readonly authService: AuthService,
    private readonly userRepository: UserRepository,
  ) {}

  async completeAuthorization(nonce?: string, email?: string, password?: string): Promise<OAuthLoginResult> {
    if (!nonce || !email || !password) return { ok: false, reason: 'invalid_data' }

    const pending = getPendingAuthorization(nonce)
    if (!pending) return { ok: false, reason: 'expired' }

    try {
      await this.authService.login(email, password)
    } catch (error) {
      if (error instanceof HttpException && hasCode(error, ErrorCode.EMAIL_NOT_VERIFIED)) {
        return { ok: false, reason: 'email_not_verified' }
      }
      return { ok: false, reason: 'invalid_credentials' }
    }

    const user = await this.userRepository.findByEmailGlobal(email)
    if (!user) return { ok: false, reason: 'user_not_found' }

    deletePendingAuthorization(nonce)

    const { code, redirectUri, state } = createAuthorizationCode(pending, {
      id: user._id.toString(),
      email: user.email,
      tenant: user.tenant,
      memberships: (user.memberships ?? []).map((m) => ({ area: m.area, access: m.access as AreaAccess })),
      role: user.role as UserRole,
    })

    const redirectUrl = new URL(redirectUri)
    redirectUrl.searchParams.set('code', code)
    if (state) redirectUrl.searchParams.set('state', state)

    console.log('[OAuth] login success:', email)
    return { ok: true, redirectUrl: redirectUrl.toString() }
  }
}

function hasCode(error: HttpException, code: ErrorCode): boolean {
  const body = error.getResponse()
  return typeof body === 'object' && body !== null && (body as { code?: unknown }).code === code
}
