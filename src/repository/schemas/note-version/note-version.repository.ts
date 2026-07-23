import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { NoteVersion, NoteVersionDocument } from './note-version.schema'

@Injectable()
export class NoteVersionRepository {
  constructor(
    @InjectModel(NoteVersion.name)
    private readonly model: Model<NoteVersionDocument>,
  ) {}

  async append(data: Partial<NoteVersion>): Promise<void> {
    await this.model.updateOne(
      { note_id: data.note_id, version: data.version },
      { $setOnInsert: data },
      { upsert: true },
    )
  }

  async appendMany(data: Partial<NoteVersion>[]): Promise<void> {
    if (!data.length) return
    await this.model.insertMany(data, { ordered: true })
  }

  async deleteByNoteIds(noteIds: Types.ObjectId[]): Promise<void> {
    await this.model.deleteMany({ note_id: { $in: noteIds } }).exec()
  }

  async findByNoteId(noteId: string): Promise<NoteVersionDocument[]> {
    return this.model
      .find({ note_id: new Types.ObjectId(noteId) })
      .sort({ version: -1 })
      .exec()
  }
}
