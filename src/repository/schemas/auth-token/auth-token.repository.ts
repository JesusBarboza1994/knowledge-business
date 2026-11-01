import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { AuthToken, AuthTokenDocument } from './auth-token.schema'

@Injectable()
export class AuthTokenRepository {
  constructor(
    @InjectModel(AuthToken.name)
    private readonly model: Model<AuthTokenDocument>,
  ) {}

  async create(data: Partial<AuthToken>): Promise<AuthTokenDocument> {
    return this.model.create(data)
  }

  /** Burns every still-unused token of a purpose, so only the latest emailed link works. */
  async invalidateUnused(userId: Types.ObjectId, purpose: string, now: Date): Promise<void> {
    await this.model.updateMany({ user_id: userId, purpose, used_at: null }, { $set: { used_at: now } }).exec()
  }

  async findLatest(userId: Types.ObjectId, purpose: string): Promise<AuthTokenDocument | null> {
    return this.model.findOne({ user_id: userId, purpose }).sort({ created_at: -1 }).exec()
  }

  /** Read without consuming — to show who invited you before you accept. */
  async findValid(tokenHash: string, purpose: string, now: Date): Promise<AuthTokenDocument | null> {
    return this.model.findOne({ token_hash: tokenHash, purpose, used_at: null, expires_at: { $gt: now } }).exec()
  }

  /** Atomic check-and-mark: two concurrent clicks on the same link cannot both succeed. */
  async consume(tokenHash: string, purpose: string, now: Date): Promise<AuthTokenDocument | null> {
    return this.model
      .findOneAndUpdate(
        { token_hash: tokenHash, purpose, used_at: null, expires_at: { $gt: now } },
        { $set: { used_at: now } },
        { new: true },
      )
      .exec()
  }
}
