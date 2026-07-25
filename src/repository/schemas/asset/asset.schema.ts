import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Types } from 'mongoose'
import { ContentStatus, Sensitivity } from '@/commons/enums'

export type AssetDocument = HydratedDocument<Asset>

/**
 * Binary attached to notes. The bytes live in S3; this record holds everything needed to
 * authorize a read, deduplicate an upload and garbage-collect an orphan.
 *
 * Authorization anchors on this record's own area/sensitivity rather than fanning out over the
 * notes that embed it: a page with ten images would otherwise cost ten reverse lookups, and a
 * freshly uploaded asset has no referencing note yet. The cost is that sensitivity can drift, so
 * it only ever moves up — embedding an asset in a more restricted note raises it, never lowers it.
 */
@Schema({ collection: 'assets', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class Asset {
  created_at?: Date
  updated_at?: Date

  @Prop({ required: true, trim: true, lowercase: true })
  tenant: string

  /** Permission scope, copied from the area the upload targeted. */
  @Prop({ required: true, trim: true, lowercase: true })
  area: string

  @Prop({ default: Sensitivity.PUBLIC_ORG, enum: Object.values(Sensitivity) })
  sensitivity: string

  @Prop({ type: [String], default: [] })
  visible_to: string[]

  /** Opaque S3 key. Keeps the model independent of the storage backend and of the bucket layout. */
  @Prop({ required: true })
  storage_key: string

  /** Validated against the allowlist on upload and echoed back as Content-Type when serving. */
  @Prop({ required: true })
  mime: string

  @Prop({ required: true })
  size: number

  /** Content hash: deduplicates uploads within a tenant and doubles as an ETag. */
  @Prop({ required: true })
  sha256: string

  /** Original name — used for the download filename and as the default alt text. */
  @Prop({ required: true, trim: true })
  filename: string

  @Prop()
  width?: number

  @Prop()
  height?: number

  @Prop({ type: Types.ObjectId, required: true })
  uploaded_by: Types.ObjectId

  /**
   * Notes embedding this asset. Drives garbage collection only — never authorization.
   * Populated when the parser starts extracting `kb:asset/<id>` refs from note bodies.
   */
  @Prop({ type: [Types.ObjectId], default: [] })
  used_by: Types.ObjectId[]

  /**
   * Archived assets keep serving: older note versions still reference them, and deleting the
   * bytes would leave broken images in the history. A separate sweep reclaims the storage.
   */
  @Prop({ default: ContentStatus.ACTIVE, enum: Object.values(ContentStatus) })
  status: string
}

export const AssetSchema = SchemaFactory.createForClass(Asset)

/**
 * Dedupe is per tenant, not global: sharing a blob across tenants would leak the existence of
 * identical content between organizations.
 */
AssetSchema.index({ tenant: 1, sha256: 1 }, { unique: true })
AssetSchema.index({ storage_key: 1 }, { unique: true })
AssetSchema.index({ tenant: 1, area: 1, status: 1 })
AssetSchema.index({ tenant: 1, used_by: 1 })
// Orphan sweep: active assets no note references, oldest first.
AssetSchema.index({ tenant: 1, status: 1, used_by: 1, created_at: 1 })
