import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Types } from 'mongoose'
import { Sensitivity } from '@/commons/enums'

export type NoteVersionDocument = HydratedDocument<NoteVersion>

@Schema({ collection: 'note_versions', timestamps: { createdAt: 'edited_at', updatedAt: false } })
export class NoteVersion {
  edited_at?: Date

  @Prop({ type: Types.ObjectId, required: true, index: true })
  note_id: Types.ObjectId

  @Prop({ required: true, trim: true, lowercase: true })
  tenant: string

  @Prop({ required: true })
  version: number

  @Prop({ required: true })
  title: string

  @Prop({ required: true })
  body: string

  @Prop({ required: true, enum: Object.values(Sensitivity) })
  sensitivity: string

  @Prop({ type: [String], default: [] })
  visible_to: string[]

  @Prop({ type: Types.ObjectId })
  edited_by: Types.ObjectId
}

export const NoteVersionSchema = SchemaFactory.createForClass(NoteVersion)
