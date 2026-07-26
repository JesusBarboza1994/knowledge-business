import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Types } from 'mongoose'
import { createHash } from 'crypto'
import { imageSize } from 'image-size'
import { AssetRepository } from '@/repository/schemas/asset/asset.repository'
import { AssetDocument } from '@/repository/schemas/asset/asset.schema'
import { AreaRepository } from '@/repository/schemas/area/area.repository'
import { S3Service } from '@/providers/s3/s3.service'
import { AssetsConfig } from '@/settings/settings.model'
import { UserProfile, isTenantAdmin, readableAreas } from '@/tools/user-profile.type'
import { Sensitivity } from '@/commons/enums'
import { PermissionService } from './permission.service'

export interface UploadAssetData {
  area: string
  filename: string
  mime: string
  buffer: Buffer
  sensitivity?: Sensitivity
  visible_to?: string[]
}

export interface AssetSummary {
  id: string
  area: string
  filename: string
  mime: string
  size: number
  width?: number
  height?: number
  sensitivity: string
  /** Body-ready reference. Never a storage URL — see AssetService docs. */
  ref: string
  markdown: string
  created_at?: Date
}

export interface AssetContent {
  buffer: Buffer
  mime: string
  filename: string
  etag: string
}

/** Body reference prefix. Kept here so the tool layer never rebuilds the string by hand. */
export const ASSET_REF_PREFIX = 'kb:asset/'

/** Accepts what a note body contains (`kb:asset/<id>`) as readily as a bare id. */
export function idFromRef(ref: string): string {
  const trimmed = ref.trim()
  return trimmed.startsWith(ASSET_REF_PREFIX) ? trimmed.slice(ASSET_REF_PREFIX.length) : trimmed
}

/** image-size doubles as a format sniffer: it reads the real header, not the declared mime. */
const MIME_BY_DETECTED_TYPE: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

/**
 * Assets are addressed in note bodies as `kb:asset/<id>`, never as a storage URL. The reference is
 * resolved at render time against an endpoint that re-checks permissions, so an image cannot
 * outlive or out-reach the note's own visibility rules — and moving buckets never rewrites a body.
 */
@Injectable()
export class AssetService {
  private readonly limits: AssetsConfig

  constructor(
    private readonly assetRepository: AssetRepository,
    private readonly areaRepository: AreaRepository,
    private readonly permissionService: PermissionService,
    private readonly s3Service: S3Service,
    configService: ConfigService,
  ) {
    this.limits = configService.get<AssetsConfig>('assets') ?? {
      maxBytes: 10 * 1024 * 1024,
      allowedMimes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    }
  }

  async upload(data: UploadAssetData, user: UserProfile): Promise<AssetSummary> {
    if (!this.s3Service.isConfigured) {
      throw new BadRequestException('Asset storage is not configured (AWS_S3_BUCKET is empty)')
    }

    const area = data.area.trim().toLowerCase()
    if (!this.permissionService.canWriteTo(user, area)) {
      throw new ForbiddenException(`Write access is required to upload assets to area "${area}"`)
    }
    const areaDocument = await this.areaRepository.findByKey(user.tenant, area)
    if (!areaDocument) throw new NotFoundException(`Area not found: ${area}`)

    if (data.buffer.length === 0) throw new BadRequestException('Empty file')
    if (data.buffer.length > this.limits.maxBytes) {
      throw new BadRequestException(`File exceeds the ${this.limits.maxBytes} byte limit`)
    }

    const { mime, width, height } = this.inspect(data.buffer)
    const sha256 = createHash('sha256').update(data.buffer).digest('hex')

    // Same bytes, same tenant: reuse the record instead of paying for a second object. The
    // original area and sensitivity win — re-uploading must not silently widen an existing asset.
    const existing = await this.assetRepository.findByChecksum(user.tenant, sha256)
    if (existing) return this.toSummary(existing)

    const storageKey = `assets/${user.tenant}/${sha256}.${mime.split('/')[1]}`
    await this.s3Service.putObject(storageKey, data.buffer, mime)

    const asset = await this.assetRepository.create({
      tenant: user.tenant,
      area,
      sensitivity: data.sensitivity ?? Sensitivity.PUBLIC_ORG,
      visible_to: data.visible_to ?? [],
      storage_key: storageKey,
      mime,
      size: data.buffer.length,
      sha256,
      filename: this.safeFilename(data.filename),
      width,
      height,
      uploaded_by: new Types.ObjectId(user.id),
    })

    return this.toSummary(asset)
  }

  /** Metadata only — cheap enough to call before deciding whether to fetch the bytes. */
  async get(id: string, user: UserProfile): Promise<AssetSummary> {
    return this.toSummary(await this.authorizedAsset(id, user))
  }

  async list(user: UserProfile, area?: string, limit?: number): Promise<AssetSummary[]> {
    const areas = isTenantAdmin(user)
      ? (await this.areaRepository.findAllByTenant(user.tenant)).map((item) => item.key)
      : readableAreas(user)
    const assets = await this.assetRepository.list(user.tenant, areas, { area, limit })
    return assets.map((asset) => this.toSummary(asset))
  }

  async download(id: string, user: UserProfile): Promise<AssetContent> {
    const asset = await this.authorizedAsset(id, user)
    return {
      buffer: await this.s3Service.getObject(asset.storage_key),
      mime: asset.mime,
      filename: asset.filename,
      etag: asset.sha256,
    }
  }

  /**
   * Archives the record and leaves the object in place: older note versions still render it.
   * Reclaiming the bytes is a separate sweep over archived, unreferenced assets.
   */
  async archive(id: string, user: UserProfile): Promise<{ id: string; status: string }> {
    const asset = await this.authorizedAsset(id, user)
    if (!this.permissionService.canWriteTo(user, asset.area)) {
      throw new ForbiddenException('Write access is required to delete assets')
    }
    const archived = await this.assetRepository.archive(user.tenant, id)
    if (!archived) throw new NotFoundException(`Asset not found: ${id}`)
    return { id, status: archived.status }
  }

  /**
   * Bytes as base64 plus the metadata the model cannot infer from the picture itself. Callers pass
   * either a bare id or the `kb:asset/<id>` reference they just read inside a note body.
   */
  async readAsImage(
    ref: string,
    user: UserProfile,
    maxBytes: number,
  ): Promise<{ summary: AssetSummary; base64: string }> {
    const asset = await this.authorizedAsset(idFromRef(ref), user)
    if (asset.size > maxBytes) {
      throw new BadRequestException(
        `Asset is ${asset.size} bytes, over the ${maxBytes} byte limit for inline delivery. ` +
          'Its metadata is still available through kb_list_assets.',
      )
    }
    const buffer = await this.s3Service.getObject(asset.storage_key)
    return { summary: this.toSummary(asset), base64: buffer.toString('base64') }
  }

  private async authorizedAsset(id: string, user: UserProfile): Promise<AssetDocument> {
    const asset = await this.assetRepository.findById(user.tenant, id)
    if (!asset) throw new NotFoundException(`Asset not found: ${id}`)
    if (!this.permissionService.canViewScope(user, asset)) throw new ForbiddenException()
    return asset
  }

  /**
   * Trusts the bytes, not the upload headers: a client can declare any Content-Type, so the format
   * comes from the header the decoder actually reads. Anything unrecognized — including SVG, which
   * is executable in a browser — never reaches storage.
   */
  private inspect(buffer: Buffer): { mime: string; width?: number; height?: number } {
    let detected: { type?: string; width?: number; height?: number }
    try {
      detected = imageSize(buffer)
    } catch {
      throw new BadRequestException('Unsupported or corrupt image file')
    }

    const mime = MIME_BY_DETECTED_TYPE[detected.type ?? '']
    if (!mime || !this.limits.allowedMimes.includes(mime)) {
      throw new BadRequestException(`Unsupported image type: ${detected.type ?? 'unknown'}`)
    }
    return { mime, width: detected.width, height: detected.height }
  }

  /** The name is echoed in Content-Disposition, so strip anything that could break out of it. */
  private safeFilename(filename: string): string {
    const base = filename.split(/[\\/]/).pop() ?? 'file'
    return base.replace(/["\r\n]/g, '').slice(0, 200) || 'file'
  }

  private toSummary(asset: AssetDocument): AssetSummary {
    const id = asset._id.toString()
    const ref = `${ASSET_REF_PREFIX}${id}`
    return {
      id,
      area: asset.area,
      filename: asset.filename,
      mime: asset.mime,
      size: asset.size,
      width: asset.width,
      height: asset.height,
      sensitivity: asset.sensitivity,
      ref,
      markdown: `![${asset.filename}](${ref})`,
      created_at: asset.created_at,
    }
  }
}
