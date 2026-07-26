import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
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

/** Records written before `areas` existed only carry `area`; treat that as the single scope. */
function effectiveAreas(asset: Pick<AssetDocument, 'area' | 'areas'>): string[] {
  return asset.areas?.length ? asset.areas : [asset.area]
}

/** Sensitivity is ordered, so "only ever raise" needs a rank rather than string comparison. */
const SENSITIVITY_RANK: Record<string, number> = {
  [Sensitivity.PUBLIC_ORG]: 0,
  [Sensitivity.INTERNAL_AREA]: 1,
  [Sensitivity.CONFIDENTIAL]: 2,
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
  private readonly logger = new Logger(AssetService.name)

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
      areas: [area],
    })

    return this.toSummary(asset)
  }

  /**
   * Records which assets a note now embeds, so an image is never a floating object nobody can
   * account for. Called on every note write with the ids the parser found in the body.
   *
   * Two effects: the note is attached to those assets (and detached from the ones it dropped), and
   * each asset's visibility rises to the note's if the note is stricter. Visibility only ever
   * rises — an image pasted into a confidential note must not stay readable org-wide, but pasting
   * it into a public one must not loosen an asset that another confidential note still shows.
   *
   * Deliberately best-effort: a failure here must not roll back the user's edit. The body is the
   * source of truth and the sweep script can rebuild this layer from it.
   */
  async syncNoteUsage(
    note: { _id: Types.ObjectId; tenant: string; area: string; sensitivity: string; visible_to?: string[] },
    assetIds: string[],
  ): Promise<void> {
    try {
      await this.assetRepository.syncUsage(note.tenant, note._id, assetIds, note.area)
      if (assetIds.length === 0) return

      const noteRank = SENSITIVITY_RANK[note.sensitivity] ?? 0
      const assets = await this.assetRepository.findByIds(note.tenant, assetIds)
      for (const asset of assets) {
        if ((SENSITIVITY_RANK[asset.sensitivity] ?? 0) >= noteRank) continue
        await this.assetRepository.raiseSensitivity(
          note.tenant,
          asset._id.toString(),
          note.sensitivity,
          note.visible_to ?? [],
        )
      }
    } catch (error) {
      this.logger.warn(
        `Failed to sync asset usage for note ${note._id.toString()}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  /** Called when a note is archived: it stops counting as a user of its images. */
  async detachNote(tenant: string, noteId: Types.ObjectId): Promise<void> {
    try {
      await this.assetRepository.detachNote(tenant, noteId)
    } catch (error) {
      this.logger.warn(
        `Failed to detach note ${noteId.toString()} from its assets: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  /**
   * Deletes assets no note embeds any more, bytes included. `minAgeHours` protects the gap between
   * storing an upload and saving the note that references it — without it, a slow editor would lose
   * the image it just pasted.
   */
  async sweepOrphans(
    options: { tenant?: string; minAgeHours?: number; limit?: number; apply?: boolean } = {},
  ): Promise<{ found: number; deleted: number; bytes: number; assets: AssetSummary[] }> {
    const { tenant, minAgeHours = 24, limit = 500, apply = false } = options
    const createdBefore = new Date(Date.now() - minAgeHours * 60 * 60 * 1000)
    const orphans = await this.assetRepository.findOrphans(tenant, createdBefore, limit)

    let deleted = 0
    let bytes = 0
    for (const asset of orphans) {
      bytes += asset.size
      if (!apply) continue
      // Storage first: a record without bytes is a broken image, bytes without a record are
      // invisible garbage the next sweep cannot even find.
      await this.s3Service.deleteObject(asset.storage_key)
      await this.assetRepository.deleteById(asset.tenant, asset._id)
      deleted += 1
    }

    return { found: orphans.length, deleted, bytes, assets: orphans.map((asset) => this.toSummary(asset)) }
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
    const authorized = this.permissionService.canViewAsset(user, {
      tenant: asset.tenant,
      areas: effectiveAreas(asset),
      sensitivity: asset.sensitivity,
      visible_to: asset.visible_to,
    })
    if (!authorized) throw new ForbiddenException()
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
