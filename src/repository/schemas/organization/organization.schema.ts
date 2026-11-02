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

  /** What the company does, in its own words (e.g. "fabricación de resortes helicoidales en acero"). */
  @Prop({ trim: true })
  description?: string

  /** E.164 country calling code, e.g. "+51". Stored apart from the number so it can be validated/listed. */
  @Prop({ trim: true })
  phone_country_code?: string

  @Prop({ trim: true })
  phone_number?: string

  /**
   * `null` = created by self sign-up and the admin has not finished the setup wizard yet.
   * Missing (organizations created before sign-up existed, or by a superadmin) counts as done.
   */
  @Prop({ type: Date, required: false })
  onboarding_completed_at?: Date | null

  @Prop({ default: OrganizationStatus.ACTIVE, enum: Object.values(OrganizationStatus) })
  status: string

  @Prop({ default: Sensitivity.PUBLIC_ORG, enum: Object.values(Sensitivity) })
  default_sensitivity: string

  @Prop({ default: OrganizationPlan.ENTERPRISE, enum: Object.values(OrganizationPlan) })
  plan: string
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization)
