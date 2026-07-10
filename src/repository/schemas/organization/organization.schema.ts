import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'
import { OrganizationPlan, OrganizationStatus, Sensitivity } from '@/commons/enums'

export type OrganizationDocument = HydratedDocument<Organization>

@Schema({ collection: 'organizations', timestamps: { createdAt: 'created_at', updatedAt: false } })
export class Organization {
  @Prop({ required: true, unique: true, trim: true, lowercase: true })
  slug: string

  @Prop({ required: true, trim: true })
  name: string

  @Prop({ default: OrganizationStatus.ACTIVE, enum: Object.values(OrganizationStatus) })
  status: string

  @Prop({ default: Sensitivity.PUBLIC_ORG, enum: Object.values(Sensitivity) })
  default_sensitivity: string

  @Prop({ default: OrganizationPlan.ENTERPRISE, enum: Object.values(OrganizationPlan) })
  plan: string
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization)
