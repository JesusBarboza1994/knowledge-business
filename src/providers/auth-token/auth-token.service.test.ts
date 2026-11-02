import { describe, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'
import { AuthTokenService } from './auth-token.service'
import { AuthTokenPurpose } from '@/commons/enums'

function build() {
  const repository = {
    invalidateUnused: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue(undefined),
    consume: vi.fn().mockResolvedValue(null),
    findLatest: vi.fn().mockResolvedValue(null),
  }
  return { service: new AuthTokenService(repository as never), repository }
}

describe('AuthTokenService', () => {
  it('guarda solo el hash del token y anula los anteriores del mismo propósito', async () => {
    const { service, repository } = build()
    const user = { _id: new Types.ObjectId(), tenant: 'acme' }

    const token = await service.issue(user, AuthTokenPurpose.RESET_PASSWORD)

    expect(repository.invalidateUnused).toHaveBeenCalledWith(
      user._id,
      AuthTokenPurpose.RESET_PASSWORD,
      expect.any(Date),
    )
    const stored = repository.create.mock.calls[0][0]
    expect(stored.token_hash).toBe(AuthTokenService.hash(token))
    expect(stored.token_hash).not.toContain(token)
    expect(stored.expires_at.getTime() - Date.now()).toBeLessThanOrEqual(60 * 60 * 1000)
  })

  it('busca por hash al consumir', async () => {
    const { service, repository } = build()
    await service.consume('abc', AuthTokenPurpose.INVITE)
    expect(repository.consume).toHaveBeenCalledWith(
      AuthTokenService.hash('abc'),
      AuthTokenPurpose.INVITE,
      expect.any(Date),
    )
  })

  it('aplica la espera entre envíos según el último token emitido', async () => {
    const { service, repository } = build()
    repository.findLatest.mockResolvedValue({ created_at: new Date() })
    await expect(service.inCooldown(new Types.ObjectId(), AuthTokenPurpose.VERIFY_EMAIL)).resolves.toBe(true)
    repository.findLatest.mockResolvedValue({ created_at: new Date(Date.now() - 5 * 60 * 1000) })
    await expect(service.inCooldown(new Types.ObjectId(), AuthTokenPurpose.VERIFY_EMAIL)).resolves.toBe(false)
  })
})
