import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

export type OrganizationDocument = HydratedDocument<Organization>

@Schema({ collection: 'organizations', timestamps: { createdAt: 'created_at', updatedAt: false } })
export class Organization {
  @Prop({ required: true, unique: true, trim: true, lowercase: true })
  slug: string

  @Prop({ required: true, trim: true })
  name: string

  @Prop({ default: 'active', enum: ['active', 'suspended', 'archived'] })
  status: string

  @Prop({ default: 'public_org', enum: ['public_org', 'internal_area', 'confidential'] })
  default_sensitivity: string

  @Prop({ default: 'enterprise', enum: ['free', 'pro', 'enterprise'] })
  plan: string
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization)
