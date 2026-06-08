import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Types } from 'mongoose'

export class Heading {
  id: string
  text: string
  level: number
}

export class Block {
  id: string
  text: string
}

export class Outlink {
  target_id: Types.ObjectId
  target_slug: string
  display: string
  source_heading: string
  source_block: string
  target_anchor: string | null
  count: number
}

export class Unresolved {
  name: string
  source_block: string
}

export type NoteDocument = HydratedDocument<Note>

@Schema({ collection: 'notes', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class Note {
  @Prop({ required: true, trim: true, lowercase: true })
  tenant: string

  @Prop({ required: true, trim: true, lowercase: true })
  area: string

  @Prop({ required: true, trim: true, lowercase: true })
  slug: string

  @Prop({ required: true, trim: true })
  title: string

  @Prop({ type: [String], default: [] })
  aliases: string[]

  @Prop({ required: true })
  body: string

  @Prop({ default: 'public_org', enum: ['public_org', 'internal_area', 'confidential'] })
  sensitivity: string

  @Prop({ type: [String], default: [] })
  visible_to: string[]

  // Derived layer (regenerated on every create/update)
  @Prop({ type: [Object], default: [] })
  headings: Heading[]

  @Prop({ type: [Object], default: [] })
  blocks: Block[]

  @Prop({ type: [Object], default: [] })
  outlinks: Outlink[]

  @Prop({ type: [Object], default: [] })
  unresolved: Unresolved[]

  @Prop({ required: true, default: 1 })
  version: number

  @Prop({ type: Types.ObjectId })
  updated_by: Types.ObjectId

  @Prop({ default: 'active', enum: ['active', 'archived'] })
  status: string
}

export const NoteSchema = SchemaFactory.createForClass(Note)

// Indexes from the design doc §2.5
NoteSchema.index({ tenant: 1, slug: 1 }, { unique: true })
NoteSchema.index({ tenant: 1, aliases: 1 })
NoteSchema.index({ tenant: 1, area: 1, sensitivity: 1 })
NoteSchema.index({ tenant: 1, 'outlinks.target_id': 1 })
NoteSchema.index({ tenant: 1, 'unresolved.name': 1 })
NoteSchema.index(
  { title: 'text', body: 'text', 'headings.text': 'text' },
  { weights: { title: 10, 'headings.text': 5, body: 1 }, name: 'text_search' },
)
