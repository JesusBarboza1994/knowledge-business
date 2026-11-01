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

describe('UsersService email global único', () => {
  function serviceWithEmail(options: { taken?: boolean; createError?: unknown } = {}) {
    const repository = {
      existsByEmail: vi.fn().mockResolvedValue(options.taken ?? false),
      create: options.createError
        ? vi.fn().mockRejectedValue(options.createError)
        : vi.fn().mockImplementation(async (data) => data),
    } as unknown as UserRepository
    const passwords = { hash: vi.fn().mockResolvedValue('hash') } as unknown as PasswordService
    return { service: new UsersService(repository, passwords), repository }
  }

  const invite = { email: 'ana@acme.com', name: 'Ana', role: UserRole.MEMBER, memberships: [] }

  it('rechaza invitar un email que ya pertenece a otra organización', async () => {
    const { service, repository } = serviceWithEmail({ taken: true })

    await expect(service.invite('acme', invite, 'admin@acme.com')).rejects.toMatchObject({
      response: { code: 'EMAIL_TAKEN' },
    })
    expect(repository.create).not.toHaveBeenCalled()
  })

  it('traduce la colisión del índice único (alta concurrente) a EMAIL_TAKEN', async () => {
    const { service } = serviceWithEmail({ createError: Object.assign(new Error('dup'), { code: 11000 }) })

    await expect(service.invite('acme', invite, 'admin@acme.com')).rejects.toMatchObject({
      response: { code: 'EMAIL_TAKEN' },
    })
  })

  it('deja pasar otros errores de base de datos sin disfrazarlos', async () => {
    const { service } = serviceWithEmail({ createError: new Error('connection lost') })

    await expect(service.invite('acme', invite, 'admin@acme.com')).rejects.toThrow('connection lost')
  })
})
