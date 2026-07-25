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
    list: vi.fn().mockResolvedValue([]),
    archive: vi.fn().mockResolvedValue(null),
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
