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

export interface ListDetailedOptions {
  area?: string
  limit?: number
  includeBody?: boolean
}

/** Projection covering everything the permission checks and link metadata need — never the body. */
export const NOTE_REFERENCE_FIELDS = 'tenant area slug title sensitivity visible_to'

/** Note fields the workspace map needs: identity, permissions and connections, without any content. */
const NOTE_MAP_FIELDS =
  'tenant area slug title kind aliases sensitivity visible_to version updated_at updated_by outlinks unresolved'

@Injectable()
export class NoteRepository {
  constructor(
    @InjectModel(Note.name)
    private readonly model: Model<NoteDocument>,
  ) {}

  /**
   * Notes the user may read, by area membership or by sensitivity (design doc §3.1).
   * Single source of truth for search, list and listDetailed.
   */
  private scopeFilter(tenant: string, areas: string[], area?: string): FilterQuery<Note> {
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
    return filter
  }

  async create(data: Partial<Note>): Promise<NoteDocument> {
    return this.model.create(data)
  }

  async createMany(data: Array<Partial<Note> & { _id: Types.ObjectId }>): Promise<NoteDocument[]> {
    const notes = await this.model.insertMany(data, { ordered: true })
    return notes as NoteDocument[]
  }

  async deleteByIds(tenant: string, ids: Types.ObjectId[]): Promise<void> {
    await this.model.deleteMany({ tenant, _id: { $in: ids } }).exec()
  }

  async findBySlug(tenant: string, slug: string): Promise<NoteDocument | null> {
    return this.model.findOne({ tenant, slug, status: ContentStatus.ACTIVE }).exec()
  }

  async findById(tenant: string, id: string): Promise<NoteDocument | null> {
    return this.model.findOne({ tenant, _id: new Types.ObjectId(id), status: ContentStatus.ACTIVE }).exec()
  }

  /** `fields` defaults to the whole document; pass NOTE_REFERENCE_FIELDS when only permissions/metadata matter. */
  async findByIds(tenant: string, ids: string[], fields?: string): Promise<NoteDocument[]> {
    const query = this.model.find({
      tenant,
      _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
      status: ContentStatus.ACTIVE,
    })
    return (fields ? query.select(fields) : query).exec()
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
    return this.model.findOne({ tenant, status: ContentStatus.ACTIVE, $or: [{ slug: ref }, { aliases: ref }] }).exec()
  }

  async findAnyBySlugOrAlias(tenant: string, ref: string): Promise<NoteDocument | null> {
    return this.model.findOne({ tenant, $or: [{ slug: ref }, { aliases: ref }] }).exec()
  }

  /** Full-text search with permission pre-filter (design doc §3.1) */
  async search(filter: NoteSearchFilter): Promise<NoteDocument[]> {
    const { tenant, areas, query, area, limit = 10 } = filter

    return this.model
      .find({ ...this.scopeFilter(tenant, areas, area), $text: { $search: query } }, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .select('tenant area slug title sensitivity headings')
      .exec()
  }

  /** List notes metadata with permission pre-filter */
  async list(tenant: string, areas: string[], area?: string, limit = 50): Promise<NoteDocument[]> {
    return this.model
      .find(this.scopeFilter(tenant, areas, area))
      .limit(limit)
      .select('tenant area slug title sensitivity version updated_at')
      .exec()
  }

  /**
   * Workspace map for the authenticated HTTP client. Bodies are excluded unless explicitly
   * requested: without them the payload stays roughly two orders of magnitude smaller and the
   * service can skip per-note link redaction entirely. Redaction is applied in the service.
   */
  async listDetailed(tenant: string, areas: string[], options: ListDetailedOptions = {}): Promise<NoteDocument[]> {
    const { area, limit = 200, includeBody = false } = options
    return this.model
      .find(this.scopeFilter(tenant, areas, area))
      .sort({ updated_at: -1 })
      .limit(limit)
      .select(includeBody ? `${NOTE_MAP_FIELDS} body` : NOTE_MAP_FIELDS)
      .exec()
  }

  /** Total readable notes, used to tell the client when a listing was cut short. */
  async countInScope(tenant: string, areas: string[], area?: string): Promise<number> {
    return this.model.countDocuments(this.scopeFilter(tenant, areas, area)).exec()
  }

  /** Notes per area without loading a single document. */
  async countByArea(tenant: string, areas: string[]): Promise<Record<string, number>> {
    const rows = await this.model
      .aggregate<{
        _id: string
        count: number
      }>([{ $match: this.scopeFilter(tenant, areas) }, { $group: { _id: '$area', count: { $sum: 1 } } }])
      .exec()
    return Object.fromEntries(rows.map((row) => [row._id, row.count]))
  }

  async update(tenant: string, id: string, data: Partial<Note>): Promise<NoteDocument | null> {
    return this.model.findOneAndUpdate({ tenant, _id: new Types.ObjectId(id) }, { $set: data }, { new: true }).exec()
  }

  async softDelete(tenant: string, id: string): Promise<NoteDocument | null> {
    return this.model
      .findOneAndUpdate(
        { tenant, _id: new Types.ObjectId(id) },
        { $set: { status: ContentStatus.ARCHIVED } },
        { new: true },
      )
      .exec()
  }

  async findBacklinks(tenant: string, targetId: string): Promise<NoteDocument[]> {
    return this.model
      .find({
        tenant,
        status: ContentStatus.ACTIVE,
        'outlinks.target_id': new Types.ObjectId(targetId),
      })
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

  /**
   * Turns every resolved link pointing at a note back into a dangling one, keeping the
   * `[[wikilink]]` in the source text. Recreating the note re-resolves them through
   * findDanglings, so archiving is reversible.
   */
  async unresolveOutlinks(tenant: string, targetId: string): Promise<{ sourceIds: string[]; connections: number }> {
    const objectId = new Types.ObjectId(targetId)
    const sources = await this.model
      .find({
        tenant,
        status: ContentStatus.ACTIVE,
        _id: { $ne: objectId },
        'outlinks.target_id': objectId,
      })
      .select('outlinks')
      .exec()

    const sourceIds: string[] = []
    let connections = 0

    for (const source of sources) {
      const inbound = source.outlinks.filter((outlink) => outlink.target_id.equals(objectId))
      if (inbound.length === 0) continue

      const byName = new Map(inbound.map((outlink) => [outlink.target_slug, outlink.source_block]))
      await this.model.updateOne(
        { _id: source._id },
        {
          $pull: { outlinks: { target_id: objectId } },
          $push: {
            unresolved: { $each: [...byName].map(([name, source_block]) => ({ name, source_block })) },
          },
        },
      )
      sourceIds.push(source._id.toString())
      connections += inbound.length
    }

    return { sourceIds, connections }
  }
}
