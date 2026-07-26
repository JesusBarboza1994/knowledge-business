import { describe, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { AreaAccess, Sensitivity, UserRole } from '@/commons/enums'
import { UserProfile } from '@/tools/user-profile.type'
import { AssetService } from './asset.service'

/** Minimal valid PNG: signature + IHDR. Enough for the header-based format sniffing. */
function pngBuffer(width = 4, height = 2): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(25)
  ihdr.writeUInt32BE(13, 0)
  ihdr.write('IHDR', 4)
  ihdr.writeUInt32BE(width, 8)
  ihdr.writeUInt32BE(height, 12)
  ihdr.writeUInt8(8, 16)
  ihdr.writeUInt8(6, 17)
  return Buffer.concat([signature, ihdr])
}

function build(options: { existing?: unknown; canWrite?: boolean; maxBytes?: number } = {}) {
  const { existing = null, canWrite = true, maxBytes = 10 * 1024 * 1024 } = options

  const assetRepository = {
    findByChecksum: vi.fn().mockResolvedValue(existing),
    create: vi.fn().mockImplementation(async (data) => ({ ...data, _id: new Types.ObjectId() })),
    findById: vi.fn().mockResolvedValue(null),
    findByIds: vi.fn().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue([]),
    archive: vi.fn().mockResolvedValue(null),
    syncUsage: vi.fn().mockResolvedValue(undefined),
    detachNote: vi.fn().mockResolvedValue(undefined),
    raiseSensitivity: vi.fn().mockResolvedValue(undefined),
    findOrphans: vi.fn().mockResolvedValue([]),
    deleteById: vi.fn().mockResolvedValue(undefined),
  }
  const areaRepository = {
    findByKey: vi.fn().mockResolvedValue({ key: 'develop' }),
    findAllByTenant: vi.fn().mockResolvedValue([]),
  }
  const permissionService = {
    canWriteTo: vi.fn().mockReturnValue(canWrite),
    canViewScope: vi.fn().mockReturnValue(true),
  }
  const s3Service = {
    isConfigured: true,
    putObject: vi.fn().mockResolvedValue(undefined),
    getObject: vi.fn().mockResolvedValue(Buffer.from('bytes')),
    deleteObject: vi.fn().mockResolvedValue(undefined),
  }
  const configService = {
    get: vi.fn().mockReturnValue({ maxBytes, allowedMimes: ['image/png', 'image/jpeg'] }),
  }

  const service = new AssetService(
    assetRepository as never,
    areaRepository as never,
    permissionService as never,
    s3Service as never,
    configService as never,
  )
  return { service, assetRepository, areaRepository, permissionService, s3Service }
}

const user: UserProfile = {
  id: new Types.ObjectId().toString(),
  email: 'user@mente2.com',
  tenant: 'mente2',
  role: UserRole.MEMBER,
  memberships: [{ area: 'develop', access: AreaAccess.WRITE }],
}

function upload(overrides: Record<string, unknown> = {}) {
  return {
    area: 'develop',
    filename: 'diagrama.png',
    mime: 'image/png',
    buffer: pngBuffer(),
    ...overrides,
  }
}

describe('AssetService.upload', () => {
  it('guarda el objeto bajo una clave por contenido y devuelve markdown listo para el body', async () => {
    const { service, s3Service, assetRepository } = build()

    const result = await service.upload(upload(), user)

    const [key, , contentType] = s3Service.putObject.mock.calls[0]
    expect(key).toMatch(/^assets\/mente2\/[a-f0-9]{64}\.png$/)
    expect(contentType).toBe('image/png')
    expect(assetRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenant: 'mente2', area: 'develop', mime: 'image/png', width: 4, height: 2 }),
    )
    expect(result.markdown).toBe(`![diagrama.png](kb:asset/${result.id})`)
    expect(result.ref).toBe(`kb:asset/${result.id}`)
  })

  it('reutiliza el asset existente cuando los bytes ya están en el tenant', async () => {
    const existing = {
      _id: new Types.ObjectId(),
      area: 'product',
      filename: 'previo.png',
      mime: 'image/png',
      size: 33,
      sensitivity: Sensitivity.INTERNAL_AREA,
    }
    const { service, s3Service, assetRepository } = build({ existing })

    const result = await service.upload(upload(), user)

    expect(s3Service.putObject).not.toHaveBeenCalled()
    expect(assetRepository.create).not.toHaveBeenCalled()
    // The original scope wins: re-uploading must not widen an asset that is already restricted.
    expect(result.area).toBe('product')
    expect(result.sensitivity).toBe(Sensitivity.INTERNAL_AREA)
  })

  it('deriva el mime de la cabecera real, no del Content-Type declarado', async () => {
    const { service, assetRepository } = build()

    await service.upload(upload({ mime: 'image/jpeg' }), user)

    expect(assetRepository.create).toHaveBeenCalledWith(expect.objectContaining({ mime: 'image/png' }))
  })

  it('rechaza SVG aunque venga disfrazado de PNG', async () => {
    const { service } = build()
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>')

    await expect(service.upload(upload({ buffer: svg }), user)).rejects.toBeInstanceOf(BadRequestException)
  })

  it('rechaza archivos que no son imagen', async () => {
    const { service } = build()

    await expect(service.upload(upload({ buffer: Buffer.from('not an image') }), user)).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it('rechaza archivos por encima del límite configurado', async () => {
    const { service } = build({ maxBytes: 10 })

    await expect(service.upload(upload(), user)).rejects.toBeInstanceOf(BadRequestException)
  })

  it('exige acceso de escritura sobre el área destino', async () => {
    const { service, s3Service } = build({ canWrite: false })

    await expect(service.upload(upload(), user)).rejects.toBeInstanceOf(ForbiddenException)
    expect(s3Service.putObject).not.toHaveBeenCalled()
  })

  it('normaliza el nombre para que no rompa el Content-Disposition', async () => {
    const { service, assetRepository } = build()

    await service.upload(upload({ filename: '../../etc/pa"sswd\n.png' }), user)

    expect(assetRepository.create).toHaveBeenCalledWith(expect.objectContaining({ filename: 'passwd.png' }))
  })
})

const NOTE_ID = new Types.ObjectId()
const ASSET_A = '6a64f94d70006eebcadf104e'

function noteScope(overrides: Record<string, unknown> = {}) {
  return {
    _id: NOTE_ID,
    tenant: 'mente2',
    area: 'develop',
    sensitivity: Sensitivity.PUBLIC_ORG,
    visible_to: [] as string[],
    ...overrides,
  }
}

describe('AssetService.syncNoteUsage', () => {
  it('registra la nota y su área en los assets que incrusta', async () => {
    const { service, assetRepository } = build()

    await service.syncNoteUsage(noteScope(), [ASSET_A])

    expect(assetRepository.syncUsage).toHaveBeenCalledWith('mente2', NOTE_ID, [ASSET_A], 'develop')
  })

  it('desvincula la nota cuando ya no incrusta ninguna imagen', async () => {
    const { service, assetRepository } = build()

    await service.syncNoteUsage(noteScope(), [])

    expect(assetRepository.syncUsage).toHaveBeenCalledWith('mente2', NOTE_ID, [], 'develop')
    // Sin ids no hay nada que reevaluar: no se consulta la sensibilidad.
    expect(assetRepository.findByIds).not.toHaveBeenCalled()
  })

  it('sube la sensibilidad del asset cuando la nota es más restringida', async () => {
    const { service, assetRepository } = build()
    assetRepository.findByIds.mockResolvedValue([
      { _id: new Types.ObjectId(ASSET_A), sensitivity: Sensitivity.PUBLIC_ORG },
    ])

    await service.syncNoteUsage(noteScope({ sensitivity: Sensitivity.CONFIDENTIAL, visible_to: ['develop'] }), [
      ASSET_A,
    ])

    expect(assetRepository.raiseSensitivity).toHaveBeenCalledWith('mente2', ASSET_A, Sensitivity.CONFIDENTIAL, [
      'develop',
    ])
  })

  /** Bajarla dejaría al descubierto una imagen que otra nota confidencial sigue mostrando. */
  it('nunca la baja', async () => {
    const { service, assetRepository } = build()
    assetRepository.findByIds.mockResolvedValue([
      { _id: new Types.ObjectId(ASSET_A), sensitivity: Sensitivity.CONFIDENTIAL },
    ])

    await service.syncNoteUsage(noteScope({ sensitivity: Sensitivity.PUBLIC_ORG }), [ASSET_A])

    expect(assetRepository.raiseSensitivity).not.toHaveBeenCalled()
  })

  /** El cuerpo es la fuente de verdad; un fallo aquí no puede tumbar la edición del usuario. */
  it('no propaga el fallo de la sincronización', async () => {
    const { service, assetRepository } = build()
    assetRepository.syncUsage.mockRejectedValue(new Error('mongo caído'))

    await expect(service.syncNoteUsage(noteScope(), [ASSET_A])).resolves.toBeUndefined()
  })
})

describe('AssetService.sweepOrphans', () => {
  const orphan = {
    _id: new Types.ObjectId(),
    tenant: 'mente2',
    area: 'develop',
    filename: 'suelta.png',
    mime: 'image/png',
    size: 2048,
    sensitivity: Sensitivity.PUBLIC_ORG,
    storage_key: 'assets/mente2/abc.png',
  }

  it('en seco informa sin borrar nada', async () => {
    const { service, assetRepository, s3Service } = build()
    assetRepository.findOrphans.mockResolvedValue([orphan])

    const result = await service.sweepOrphans({ tenant: 'mente2' })

    expect(result).toMatchObject({ found: 1, deleted: 0, bytes: 2048 })
    expect(s3Service.deleteObject).not.toHaveBeenCalled()
    expect(assetRepository.deleteById).not.toHaveBeenCalled()
  })

  it('con apply borra primero los bytes y luego el registro', async () => {
    const { service, assetRepository, s3Service } = build()
    assetRepository.findOrphans.mockResolvedValue([orphan])
    const order: string[] = []
    s3Service.deleteObject.mockImplementation(async () => void order.push('s3'))
    assetRepository.deleteById.mockImplementation(async () => void order.push('mongo'))

    const result = await service.sweepOrphans({ tenant: 'mente2', apply: true })

    expect(result).toMatchObject({ found: 1, deleted: 1 })
    // Un registro sin bytes es una imagen rota; bytes sin registro son basura invisible.
    expect(order).toEqual(['s3', 'mongo'])
  })

  it('respeta la antigüedad mínima al consultar', async () => {
    const { service, assetRepository } = build()

    await service.sweepOrphans({ tenant: 'mente2', minAgeHours: 48, limit: 10 })

    const [tenant, createdBefore, limit] = assetRepository.findOrphans.mock.calls[0]
    expect(tenant).toBe('mente2')
    expect(limit).toBe(10)
    const hoursAgo = (Date.now() - createdBefore.getTime()) / 3_600_000
    expect(hoursAgo).toBeGreaterThan(47.9)
    expect(hoursAgo).toBeLessThan(48.1)
  })
})
