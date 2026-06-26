import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

export type UserDocument = HydratedDocument<User>

@Schema({ collection: 'users', timestamps: { createdAt: 'created_at', updatedAt: false } })
export class User {
  @Prop({ required: true, trim: true, lowercase: true })
  tenant: string

  @Prop({ required: true, trim: true, lowercase: true })
  email: string

  @Prop({ type: [String], default: [] })
  areas: string[]

  @Prop({ default: 'viewer', enum: ['viewer', 'editor', 'area_admin', 'admin'] })
  role: string

  @Prop({ trim: true, required: false })
  occupation?: string

  @Prop({ select: false })
  password_hash?: string

  @Prop({ default: 'active', enum: ['active', 'inactive'] })
  status: string
}

export const UserSchema = SchemaFactory.createForClass(User)
UserSchema.index({ tenant: 1, email: 1 }, { unique: true })
