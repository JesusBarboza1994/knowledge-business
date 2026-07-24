import { ForbiddenException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { AreaAccess, UserRole, UserStatus } from '@/commons/enums'
import { PasswordService } from '@/providers/password/password.service'
import { UserRepository } from '@/repository/schemas/user/user.repository'
import { UsersService } from './users.service'

function serviceWith(existing: { id: string; role: UserRole; status: UserStatus }) {
  const document = {
    _id: { toString: () => existing.id },
    role: existing.role,
    status: existing.status,
    memberships: [],
  }
  const repository = {
    findById: vi.fn().mockResolvedValue(document),
    updateById: vi.fn().mockResolvedValue(document),
  } as unknown as UserRepository
  const passwords = {} as PasswordService
  return { service: new UsersService(repository, passwords), repository }
}

describe('UsersService.updateAccess', () => {
  it('impide que un admin otorgue el rol superadmin', async () => {
    const { service } = serviceWith({ id: 'member-1', role: UserRole.MEMBER, status: UserStatus.ACTIVE })

    await expect(
      service.updateAccess('tenant', 'member-1', { role: UserRole.SUPERADMIN }, 'admin@example.com', {
        id: 'admin-1',
        role: UserRole.ADMIN,
      }),
    ).rejects.toThrow(ForbiddenException)
  })

  it('impide que un admin modifique un superadmin', async () => {
    const { service } = serviceWith({ id: 'root-1', role: UserRole.SUPERADMIN, status: UserStatus.ACTIVE })

    await expect(
      service.updateAccess(
        'tenant',
        'root-1',
        { memberships: [{ area: 'develop', access: AreaAccess.READ }] },
        'admin@example.com',
        { id: 'admin-1', role: UserRole.ADMIN },
      ),
    ).rejects.toThrow(ForbiddenException)
  })

  it('impide cambiar el rol o estado propio', async () => {
    const { service } = serviceWith({ id: 'admin-1', role: UserRole.ADMIN, status: UserStatus.ACTIVE })

    await expect(
      service.updateAccess('tenant', 'admin-1', { status: UserStatus.INACTIVE }, 'admin@example.com', {
        id: 'admin-1',
        role: UserRole.ADMIN,
      }),
    ).rejects.toThrow(ForbiddenException)
  })

  it('permite promover un miembro a administrador', async () => {
    const { service, repository } = serviceWith({ id: 'member-1', role: UserRole.MEMBER, status: UserStatus.ACTIVE })

    await service.updateAccess('tenant', 'member-1', { role: UserRole.ADMIN }, 'admin@example.com', {
      id: 'admin-1',
      role: UserRole.ADMIN,
    })

    expect(repository.updateById).toHaveBeenCalledWith('tenant', 'member-1', { role: UserRole.ADMIN })
  })
})
