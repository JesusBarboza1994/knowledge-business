import { describe, expect, it, vi } from 'vitest'
import { ConfigService } from '@nestjs/config'
import { OrganizationsService } from './organizations.service'

function build(org: Record<string, unknown> | null) {
  const repository = {
    findBySlug: vi.fn().mockResolvedValue(org),
    updateBySlug: vi.fn().mockImplementation(async (_slug, data) => ({ ...org, ...data })),
  }
  const config = { get: vi.fn().mockReturnValue({ publicUrl: 'https://api.example.com' }) }
  return { service: new OrganizationsService(repository as never, config as unknown as ConfigService), repository }
}

describe('OrganizationsService', () => {
  it('marca el asistente como terminado', async () => {
    const { service, repository } = build({ slug: 'acme', onboarding_completed_at: null })

    const result = await service.completeOnboarding('acme')

    expect(repository.updateBySlug).toHaveBeenCalledWith('acme', { onboarding_completed_at: expect.any(Date) })
    expect(result.onboarding_completed_at).toBeInstanceOf(Date)
  })

  it('terminarlo dos veces conserva la primera fecha', async () => {
    const first = new Date('2026-10-01')
    const { service, repository } = build({ slug: 'acme', onboarding_completed_at: first })

    await service.completeOnboarding('acme')

    expect(repository.updateBySlug).not.toHaveBeenCalled()
  })

  it('expone una única URL de MCP para todas las organizaciones', () => {
    expect(build(null).service.connectInfo()).toEqual({
      product_name: 'NoesisHub',
      mcp_url: 'https://api.example.com/mcp',
      auth: 'oauth',
    })
  })
})
