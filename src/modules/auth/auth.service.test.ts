import { describe, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'
import { AuthService } from './auth.service'
import { UnauthorizedException } from '@/commons/exceptions/auth/unauthorized.exception'
import { UserRole, UserStatus } from '@/commons/enums'

function build(emailVerifiedAt: Date | null | undefined, passwordOk = true) {
  const user = {
    _id: new Types.ObjectId(),
    email: 'ana@acme.com',
    tenant: 'acme',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    memberships: [],
    password_hash: 'salt:hash',
    ...(emailVerifiedAt === undefined ? {} : { email_verified_at: emailVerifiedAt }),
  }
  const repository = { findByEmailWithPassword: vi.fn().mockResolvedValue(user) }
  const tokens = { generateToken: vi.fn().mockReturnValue('session-token') }
  const passwords = { verify: vi.fn().mockResolvedValue(passwordOk) }
  return new AuthService(repository as never, tokens as never, passwords as never)
}

describe('AuthService.login', () => {
  it('rechaza a quien aún no verificó su email con EMAIL_NOT_VERIFIED', async () => {
    await expect(build(null).login('ana@acme.com', 'secreta')).rejects.toMatchObject({
      response: { code: 'EMAIL_NOT_VERIFIED' },
    })
  })

  it('no revela que el email está sin verificar si la contraseña es incorrecta', async () => {
    await expect(build(null, false).login('ana@acme.com', 'mala')).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('deja entrar a usuarios anteriores al registro (sin el campo) y a los verificados', async () => {
    await expect(build(undefined).login('ana@acme.com', 'secreta')).resolves.toBe('session-token')
    await expect(build(new Date()).login('ana@acme.com', 'secreta')).resolves.toBe('session-token')
  })
})
