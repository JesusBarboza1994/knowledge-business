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

  async append(data: Partial<NoteVersion>): Promise<NoteVersionDocument> {
    return this.model.create(data)
  }

  async findByNoteId(noteId: string): Promise<NoteVersionDocument[]> {
    return this.model
      .find({ note_id: new Types.ObjectId(noteId) })
      .sort({ version: -1 })
      .exec()
  }
}
