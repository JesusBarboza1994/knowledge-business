import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Organization, OrganizationDocument } from './organization.schema'

@Injectable()
export class OrganizationRepository {
  constructor(
    @InjectModel(Organization.name)
    private readonly model: Model<OrganizationDocument>,
  ) {}

  async create(data: Partial<Organization>): Promise<OrganizationDocument> {
    return this.model.create(data)
  }

  async findBySlug(slug: string): Promise<OrganizationDocument | null> {
    return this.model.findOne({ slug, status: 'active' }).exec()
  }

  async findById(id: string): Promise<OrganizationDocument | null> {
    return this.model.findById(id).exec()
  }

  async findAll(): Promise<OrganizationDocument[]> {
    return this.model.find({ status: 'active' }).exec()
  }

  async update(id: string, data: Partial<Organization>): Promise<OrganizationDocument | null> {
    return this.model.findByIdAndUpdate(id, { $set: data }, { new: true }).exec()
  }
}
