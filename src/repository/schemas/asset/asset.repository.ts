import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Asset, AssetDocument } from './asset.schema'
import { ContentStatus } from '@/commons/enums'

export interface ListAssetsOptions {
  area?: string
  limit?: number
}

@Injectable()
export class AssetRepository {
  constructor(
    @InjectModel(Asset.name)
    private readonly model: Model<AssetDocument>,
  ) {}

  async create(data: Partial<Asset>): Promise<AssetDocument> {
    return this.model.create(data)
  }

  /** Archived assets are still readable: old note versions keep pointing at them. */
  async findById(tenant: string, id: string): Promise<AssetDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null
    return this.model.findOne({ _id: new Types.ObjectId(id), tenant }).exec()
  }

  /** Dedupe lookup — an identical upload in the same tenant reuses the existing record. */
  async findByChecksum(tenant: string, sha256: string): Promise<AssetDocument | null> {
    return this.model.findOne({ tenant, sha256 }).exec()
  }

  async findByIds(tenant: string, ids: string[]): Promise<AssetDocument[]> {
    const objectIds = ids.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id))
    if (objectIds.length === 0) return []
    return this.model.find({ tenant, _id: { $in: objectIds } }).exec()
  }

  /**
   * Records that a note embeds exactly `ids` — attaching the ones it shows and detaching the ones
   * it stopped showing. Two bulk writes rather than one per asset, because a note can carry dozens
   * of images and this runs inside every save.
   */
  async syncUsage(tenant: string, noteId: Types.ObjectId, ids: string[], area: string): Promise<void> {
    const objectIds = ids.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id))

    if (objectIds.length > 0) {
      await this.model
        .updateMany({ tenant, _id: { $in: objectIds } }, { $addToSet: { used_by: noteId, areas: area } })
        .exec()
    }

    await this.model
      .updateMany({ tenant, used_by: noteId, _id: { $nin: objectIds } }, { $pull: { used_by: noteId } })
      .exec()
  }

  /**
   * Drops a note from every asset that listed it. `areas` is deliberately left alone: recomputing
   * it would need the areas of all remaining notes, and an area that lingers only ever grants
   * access to people who could already see the asset while the note existed.
   */
  async detachNote(tenant: string, noteId: Types.ObjectId): Promise<void> {
    await this.model.updateMany({ tenant, used_by: noteId }, { $pull: { used_by: noteId } }).exec()
  }

  /**
   * Assets no note embeds any more. The age floor keeps a fresh upload alive during the window
   * between storing the bytes and saving the note that references them.
   */
  async findOrphans(tenant: string | undefined, createdBefore: Date, limit = 500): Promise<AssetDocument[]> {
    return this.model
      .find({
        ...(tenant ? { tenant } : {}),
        used_by: { $size: 0 },
        created_at: { $lt: createdBefore },
      })
      .sort({ created_at: 1 })
      .limit(limit)
      .exec()
  }

  async deleteById(tenant: string, id: Types.ObjectId): Promise<void> {
    await this.model.deleteOne({ _id: id, tenant }).exec()
  }

  /** Matches on both fields: `areas` is empty on records predating it, `area` is the origin. */
  async list(tenant: string, areas: string[], options: ListAssetsOptions = {}): Promise<AssetDocument[]> {
    const scope = options.area ? [options.area] : areas
    return this.model
      .find({
        tenant,
        status: ContentStatus.ACTIVE,
        $or: [{ area: { $in: scope } }, { areas: { $in: scope } }],
      })
      .sort({ created_at: -1 })
      .limit(options.limit ?? 100)
      .exec()
  }

  async archive(tenant: string, id: string): Promise<AssetDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null
    return this.model
      .findOneAndUpdate({ _id: new Types.ObjectId(id), tenant }, { status: ContentStatus.ARCHIVED }, { new: true })
      .exec()
  }

  /**
   * Sensitivity only ever rises. `$max` on an ordered rank would be cleaner, but the values are
   * strings, so the caller passes the already-resolved level and we guard against lowering it here.
   */
  async raiseSensitivity(tenant: string, id: string, sensitivity: string, visibleTo: string[]): Promise<void> {
    if (!Types.ObjectId.isValid(id)) return
    await this.model
      .updateOne(
        { _id: new Types.ObjectId(id), tenant },
        { sensitivity, $addToSet: { visible_to: { $each: visibleTo } } },
      )
      .exec()
  }

  async totalBytes(tenant: string): Promise<number> {
    const [result] = await this.model
      .aggregate<{
        total: number
      }>([{ $match: { tenant, status: ContentStatus.ACTIVE } }, { $group: { _id: null, total: { $sum: '$size' } } }])
      .exec()
    return result?.total ?? 0
  }
}
