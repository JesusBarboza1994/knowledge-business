import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { User, UserDocument } from './user.schema'
import { UserStatus } from '@/commons/enums'

@Injectable()
export class UserRepository {
  constructor(
    @InjectModel(User.name)
    private readonly model: Model<UserDocument>,
  ) {}

  async create(data: Partial<User>): Promise<UserDocument> {
    return this.model.create(data)
  }

  async findByEmail(tenant: string, email: string): Promise<UserDocument | null> {
    return this.model.findOne({ tenant, email: email.toLowerCase(), status: UserStatus.ACTIVE }).exec()
  }

  /** Lookup by email alone — used at SSE connection time when tenant is not yet known */
  async findByEmailGlobal(email: string): Promise<UserDocument | null> {
    return this.model.findOne({ email: email.toLowerCase(), status: UserStatus.ACTIVE }).exec()
  }

  async findAllByTenant(tenant: string): Promise<UserDocument[]> {
    return this.model.find({ tenant, status: UserStatus.ACTIVE }).exec()
  }

  async update(tenant: string, email: string, data: Partial<User>): Promise<UserDocument | null> {
    return this.model.findOneAndUpdate({ tenant, email }, { $set: data }, { new: true }).exec()
  }

  /** Returns user including password_hash — only for authentication */
  async findByEmailWithPassword(email: string): Promise<UserDocument | null> {
    return this.model
      .findOne({ email: email.toLowerCase(), status: UserStatus.ACTIVE })
      .select('+password_hash')
      .exec()
  }

  async setPasswordHash(tenant: string, email: string, password_hash: string): Promise<void> {
    await this.model.updateOne({ tenant, email: email.toLowerCase() }, { $set: { password_hash } })
  }
}
