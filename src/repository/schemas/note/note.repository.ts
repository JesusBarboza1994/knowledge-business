import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { FilterQuery, Model, Types } from 'mongoose'
import { Note, NoteDocument, Outlink } from './note.schema'
import { ContentStatus, Sensitivity } from '@/commons/enums'

export interface NoteSearchFilter {
  tenant: string
  areas: string[]
  query: string
  area?: string
  limit?: number
}

@Injectable()
export class NoteRepository {
  constructor(
    @InjectModel(Note.name)
    private readonly model: Model<NoteDocument>,
  ) {}

  async create(data: Partial<Note>): Promise<NoteDocument> {
    return this.model.create(data)
  }

  async findBySlug(tenant: string, slug: string): Promise<NoteDocument | null> {
    return this.model.findOne({ tenant, slug, status: ContentStatus.ACTIVE }).exec()
  }

  async findById(tenant: string, id: string): Promise<NoteDocument | null> {
    return this.model.findOne({ tenant, _id: new Types.ObjectId(id), status: ContentStatus.ACTIVE }).exec()
  }

  async findByIds(tenant: string, ids: string[]): Promise<NoteDocument[]> {
    return this.model
      .find({ tenant, _id: { $in: ids.map((id) => new Types.ObjectId(id)) }, status: ContentStatus.ACTIVE })
      .exec()
  }

  async findByAreaKind(tenant: string, area: string, kind: string): Promise<NoteDocument | null> {
    return this.model.findOne({ tenant, area, kind, status: ContentStatus.ACTIVE }).exec()
  }

  async findAllActive(): Promise<NoteDocument[]> {
    return this.model
      .find({ status: ContentStatus.ACTIVE })
      .select('tenant area slug aliases sensitivity visible_to outlinks version')
      .exec()
  }

  async findBySlugOrAlias(tenant: string, ref: string): Promise<NoteDocument | null> {
    return this.model
      .findOne({ tenant, status: ContentStatus.ACTIVE, $or: [{ slug: ref }, { aliases: ref }] })
      .exec()
  }

  /** Full-text search with permission pre-filter (design doc §3.1) */
  async search(filter: NoteSearchFilter): Promise<NoteDocument[]> {
    const { tenant, areas, query, area, limit = 10 } = filter
    const permissionFilter: FilterQuery<Note> = {
      tenant,
      status: ContentStatus.ACTIVE,
      $or: [
        { area: { $in: areas } },
        { sensitivity: Sensitivity.PUBLIC_ORG },
        { sensitivity: Sensitivity.INTERNAL_AREA, visible_to: { $in: areas } },
      ],
    }
    if (area) permissionFilter.area = area

    return this.model
      .find({ ...permissionFilter, $text: { $search: query } }, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .select('tenant area slug title sensitivity headings')
      .exec()
  }

  /** List notes metadata with permission pre-filter */
  async list(tenant: string, areas: string[], area?: string, limit = 50): Promise<NoteDocument[]> {
    const filter: FilterQuery<Note> = {
      tenant,
      status: ContentStatus.ACTIVE,
      $or: [
        { area: { $in: areas } },
        { sensitivity: Sensitivity.PUBLIC_ORG },
        { sensitivity: Sensitivity.INTERNAL_AREA, visible_to: { $in: areas } },
      ],
    }
    if (area) filter.area = area
    return this.model.find(filter).limit(limit).select('tenant area slug title sensitivity version updated_at').exec()
  }

  async update(tenant: string, id: string, data: Partial<Note>): Promise<NoteDocument | null> {
    return this.model
      .findOneAndUpdate({ tenant, _id: new Types.ObjectId(id) }, { $set: data }, { new: true })
      .exec()
  }

  async softDelete(tenant: string, id: string): Promise<NoteDocument | null> {
    return this.model
      .findOneAndUpdate({ tenant, _id: new Types.ObjectId(id) }, { $set: { status: ContentStatus.ARCHIVED } }, { new: true })
      .exec()
  }

  /** Resolve dangling links pointing to a slug (used on note creation) */
  async findDanglings(tenant: string, slug: string): Promise<NoteDocument[]> {
    return this.model.find({ tenant, status: ContentStatus.ACTIVE, 'unresolved.name': slug }).exec()
  }

  /** Move a dangling entry to outlinks after the target note is created */
  async resolveDangling(noteId: string, slug: string, outlink: Outlink): Promise<void> {
    await this.model.updateOne(
      { _id: new Types.ObjectId(noteId) },
      {
        $pull: { unresolved: { name: slug } },
        $push: { outlinks: outlink },
      },
    )
  }

  /** Remove an outlink from all notes that pointed to a deleted note */
  async unresolveOutlinks(tenant: string, targetId: string): Promise<void> {
    const objectId = new Types.ObjectId(targetId)
    // Find notes that have this target in outlinks
    const notes = await this.model.find({ tenant, 'outlinks.target_id': objectId }).exec()
    for (const note of notes) {
      const outlink = note.outlinks.find((o) => o.target_id.equals(objectId))
      if (!outlink) continue
      await this.model.updateOne(
        { _id: note._id },
        {
          $pull: { outlinks: { target_id: objectId } },
          $push: { unresolved: { name: outlink.target_slug, source_block: outlink.source_block } },
        },
      )
    }
  }
}
