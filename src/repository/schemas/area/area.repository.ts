import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Area, AreaDocument } from './area.schema'
import { ContentStatus } from '@/commons/enums'

@Injectable()
export class AreaRepository {
  constructor(
    @InjectModel(Area.name)
    private readonly model: Model<AreaDocument>,
  ) {}

  async create(data: Partial<Area>): Promise<AreaDocument> {
    return this.model.create(data)
  }

  async findByKey(tenant: string, key: string): Promise<AreaDocument | null> {
    return this.model.findOne({ tenant, key, status: ContentStatus.ACTIVE }).exec()
  }

  async findAllByTenant(tenant: string): Promise<AreaDocument[]> {
    return this.model.find({ tenant, status: ContentStatus.ACTIVE }).exec()
  }

  async update(tenant: string, key: string, data: Partial<Area>): Promise<AreaDocument | null> {
    return this.model.findOneAndUpdate({ tenant, key }, { $set: data }, { new: true }).exec()
  }
}
