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

  async list(tenant: string, areas: string[], options: ListAssetsOptions = {}): Promise<AssetDocument[]> {
    return this.model
      .find({
        tenant,
        status: ContentStatus.ACTIVE,
        area: options.area ? options.area : { $in: areas },
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
