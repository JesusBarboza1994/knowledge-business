import { describe, expect, it, vi } from 'vitest'
import { AreaRepository } from '@/repository/schemas/area/area.repository'
import { AreasService } from './areas.service'

function serviceWith(options: { exists?: boolean; createError?: unknown } = {}) {
  const repository = {
    existsByKey: vi.fn().mockResolvedValue(options.exists ?? false),
    create: options.createError
      ? vi.fn().mockRejectedValue(options.createError)
      : vi.fn().mockImplementation(async (data) => data),
  } as unknown as AreaRepository
  return { service: new AreasService(repository), repository }
}

const dto = { tenant: 'acme', key: 'ventas', name: 'Ventas' }

describe('AreasService.create', () => {
  it('rechaza reutilizar la clave de un área archivada con un 409 legible', async () => {
    const { service, repository } = serviceWith({ exists: true })

    await expect(service.create(dto)).rejects.toMatchObject({ response: { code: 'AREA_KEY_TAKEN' } })
    expect(repository.create).not.toHaveBeenCalled()
  })

  it('traduce la colisión del índice único a AREA_KEY_TAKEN en lugar de un 500', async () => {
    const { service } = serviceWith({ createError: Object.assign(new Error('dup'), { code: 11000 }) })

    await expect(service.create(dto)).rejects.toMatchObject({ response: { code: 'AREA_KEY_TAKEN' } })
  })
})
