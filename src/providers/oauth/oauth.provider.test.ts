import { describe, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'
import { configureOAuthProvider, knowledgeOAuthProvider, resolveCurrentProfile } from './oauth.provider'
import { AreaAccess, UserRole, UserStatus } from '@/commons/enums'

const id = new Types.ObjectId()
const claimed = {
  id: id.toString(),
  email: 'ana@acme.com',
  tenant: 'acme',
  role: UserRole.ADMIN,
  memberships: [{ area: 'ventas', access: AreaAccess.MANAGE }],
}

function withStoredUser(stored: Record<string, unknown> | null) {
  const userRepository = { findByIdGlobal: vi.fn().mockResolvedValue(stored) }
  const tokenService = {
    extractFromTokenWithExpiration: vi.fn().mockReturnValue({ user: claimed, expiresAt: 9999999999 }),
  }
  configureOAuthProvider({ tokenService: tokenService as never, userRepository: userRepository as never })
  return userRepository
}

const active = {
  _id: id,
  email: 'ana@acme.com',
  tenant: 'acme',
  status: UserStatus.ACTIVE,
  role: UserRole.MEMBER,
  memberships: [{ area: 'soporte', access: AreaAccess.READ }],
}

describe('MCP: permisos leídos desde la base de datos', () => {
  it('usa el rol y las áreas actuales, no las que quedaron en el token', async () => {
    withStoredUser(active)

    const info = await knowledgeOAuthProvider.verifyAccessToken('token')

    expect(info.extra).toMatchObject({
      role: UserRole.MEMBER,
      memberships: [{ area: 'soporte', access: AreaAccess.READ }],
    })
  })

  it('invalida el token de un usuario desactivado, borrado o sin verificar', async () => {
    for (const stored of [{ ...active, status: UserStatus.INACTIVE }, null, { ...active, email_verified_at: null }]) {
      withStoredUser(stored)
      await expect(knowledgeOAuthProvider.verifyAccessToken('token')).rejects.toThrow('no longer active')
    }
  })

  it('rechaza si el usuario guardado ya no coincide con la organización o el email del token', async () => {
    withStoredUser({ ...active, tenant: 'otra' })
    await expect(resolveCurrentProfile(claimed)).resolves.toBeUndefined()
    withStoredUser({ ...active, email: 'otro@acme.com' })
    await expect(resolveCurrentProfile(claimed)).resolves.toBeUndefined()
  })
})
