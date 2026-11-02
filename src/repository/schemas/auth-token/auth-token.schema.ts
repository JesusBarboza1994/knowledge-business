import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Types } from 'mongoose'
import { AuthTokenPurpose } from '@/commons/enums'

export type AuthTokenDocument = HydratedDocument<AuthToken>

/**
 * Single-use tokens sent by email (verify email, reset password, accept invitation).
 * Only the SHA-256 of the token is stored: a database leak must not hand out working links.
 */
@Schema({ collection: 'auth_tokens', timestamps: { createdAt: 'created_at', updatedAt: false } })
export class AuthToken {
  @Prop({ type: Types.ObjectId, required: true })
  user_id: Types.ObjectId

  @Prop({ required: true, trim: true, lowercase: true })
  tenant: string

  @Prop({ required: true, enum: Object.values(AuthTokenPurpose) })
  purpose: string

  @Prop({ required: true })
  token_hash: string

  @Prop({ required: true })
  expires_at: Date

  @Prop({ type: Date, default: null })
  used_at: Date | null

  created_at?: Date
}

export const AuthTokenSchema = SchemaFactory.createForClass(AuthToken)
AuthTokenSchema.index({ token_hash: 1 }, { unique: true })
AuthTokenSchema.index({ user_id: 1, purpose: 1, created_at: -1 })
// Mongo drops expired tokens on its own; validity is still checked on read (the TTL monitor lags).
AuthTokenSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 })
