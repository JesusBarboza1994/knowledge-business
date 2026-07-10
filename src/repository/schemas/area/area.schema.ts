import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Types } from 'mongoose'
import { ContentStatus, Sensitivity } from '@/commons/enums'

export type AreaDocument = HydratedDocument<Area>

@Schema({ collection: 'areas', timestamps: { createdAt: 'created_at', updatedAt: false } })
export class Area {
  @Prop({ required: true, trim: true, lowercase: true })
  tenant: string

  @Prop({ required: true, trim: true, lowercase: true })
  key: string

  @Prop({ required: true, trim: true })
  name: string

  @Prop({ trim: true })
  description: string

  @Prop({ default: Sensitivity.PUBLIC_ORG, enum: Object.values(Sensitivity) })
  default_sensitivity: string

  @Prop({ type: [Types.ObjectId], default: [] })
  admins: Types.ObjectId[]

  @Prop({ default: ContentStatus.ACTIVE, enum: Object.values(ContentStatus) })
  status: string
}

export const AreaSchema = SchemaFactory.createForClass(Area)
AreaSchema.index({ tenant: 1, key: 1 }, { unique: true })
