import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'
import { AreaAccess, UserRole, UserStatus } from '@/commons/enums'

export type UserDocument = HydratedDocument<User>

@Schema({ _id: false })
export class UserMembership {
  @Prop({ required: true, trim: true, lowercase: true })
  area: string

  @Prop({ required: true, enum: Object.values(AreaAccess) })
  access: string

  @Prop({ default: () => new Date() })
  granted_at: Date

  @Prop({ trim: true, lowercase: true, required: false })
  granted_by?: string
}

export const UserMembershipSchema = SchemaFactory.createForClass(UserMembership)

@Schema({ collection: 'users', timestamps: { createdAt: 'created_at', updatedAt: false } })
export class User {
  @Prop({ required: true, trim: true, lowercase: true })
  tenant: string

  @Prop({ required: true, trim: true, lowercase: true })
  email: string

  @Prop({ trim: true })
  name?: string

  @Prop({ type: [UserMembershipSchema], default: [] })
  memberships: UserMembership[]

  @Prop({ default: UserRole.MEMBER, enum: Object.values(UserRole) })
  role: string

  @Prop({ trim: true, required: false })
  occupation?: string

  @Prop({ select: false })
  password_hash?: string

  @Prop({ default: UserStatus.ACTIVE, enum: Object.values(UserStatus) })
  status: string
}

export const UserSchema = SchemaFactory.createForClass(User)
UserSchema.index({ tenant: 1, email: 1 }, { unique: true })
