import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Types } from 'mongoose'
import { NoteRepository } from '@/repository/schemas/note/note.repository'
import { NoteVersionRepository } from '@/repository/schemas/note-version/note-version.repository'
import { AreaRepository } from '@/repository/schemas/area/area.repository'
import { UserProfile } from '@/tools/user-profile.type'
import { PermissionService } from './permission.service'
import { ParserService } from './parser.service'
import { NameIndexService, Edge } from './name-index.service'
import { Note, NoteDocument, Outlink } from '@/repository/schemas/note/note.schema'

function normalizeSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúüñ]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export interface CreateNoteData {
  area: string
  title: string
  body: string
  sensitivity?: string
  visible_to?: string[]
}

export interface UpdateNotePatch {
  body?: string
  title?: string
  sensitivity?: string
  visible_to?: string[]
}

@Injectable()
export class KnowledgeService {
  constructor(
    private readonly noteRepository: NoteRepository,
    private readonly noteVersionRepository: NoteVersionRepository,
    private readonly areaRepository: AreaRepository,
    private readonly permissionService: PermissionService,
    private readonly parserService: ParserService,
    private readonly nameIndexService: NameIndexService,
  ) {}

  // ─── READ ────────────────────────────────────────────────────────────────

  async search(query: string, user: UserProfile, limit = 10): Promise<NoteDocument[]> {
    return this.noteRepository.search({ tenant: user.tenant, areas: user.areas, query, limit })
  }

  async get(ref: string, user: UserProfile): Promise<NoteDocument> {
    const note = await this.noteRepository.findBySlugOrAlias(user.tenant, ref)
    if (!note) throw new NotFoundException(`Note not found: ${ref}`)
    if (!this.permissionService.canView(user, note)) throw new ForbiddenException()
    return note
  }

  async links(
    ref: string,
    dir: 'out' | 'in' | 'both',
    user: UserProfile,
  ): Promise<{ out: (Edge | null)[]; in: (Edge | null)[] }> {
    const note = await this.get(ref, user)
    const noteId = note._id.toString()

    const filterEdge = async (edge: Edge): Promise<boolean> => {
      const targetNote = await this.noteRepository.findById(user.tenant, edge.target_id.toString())
      if (!targetNote) return false
      return this.permissionService.canView(user, targetNote)
    }

    const out = dir !== 'in' ? this.nameIndexService.getOutEdges(noteId) : []
    const inn = dir !== 'out' ? this.nameIndexService.getInEdges(noteId) : []

    const [filteredOut, filteredIn] = await Promise.all([
      Promise.all(out.map(async (e) => ((await filterEdge(e)) ? e : null))),
      Promise.all(inn.map(async (e) => ((await filterEdge(e)) ? e : null))),
    ])

    return {
      out: filteredOut.filter(Boolean),
      in: filteredIn.filter(Boolean),
    }
  }

  async list(user: UserProfile, limit = 50): Promise<NoteDocument[]> {
    return this.noteRepository.list(user.tenant, user.areas, undefined, limit)
  }

  // ─── WRITE ───────────────────────────────────────────────────────────────

  async create(data: CreateNoteData, user: UserProfile): Promise<NoteDocument> {
    if (!['editor', 'area_admin', 'admin'].includes(user.role) || !user.areas.includes(data.area)) {
      throw new ForbiddenException('Insufficient permissions to create notes in this area')
    }

    const areaDoc = await this.areaRepository.findByKey(user.tenant, data.area)
    const sensitivity = data.sensitivity ?? areaDoc?.default_sensitivity ?? 'public_org'

    const slug = normalizeSlug(data.title)

    const existing = await this.noteRepository.findBySlug(user.tenant, slug)
    if (existing) throw new ConflictException(`A note with slug "${slug}" already exists`)

    const parsed = this.parserService.parse(data.body)

    const outlinks: Outlink[] = []
    const unresolved: { name: string; source_block: string }[] = []

    for (const link of parsed.links) {
      const targetId = this.nameIndexService.resolveSlug(user.tenant, link.name)
      if (targetId) {
        outlinks.push({
          target_id: new Types.ObjectId(targetId),
          target_slug: link.name,
          display: link.display,
          source_heading: link.source_heading,
          source_block: link.source_block,
          target_anchor: link.anchor,
          count: 1,
        })
      } else {
        unresolved.push({ name: link.name, source_block: link.source_block })
      }
    }

    const note = await this.noteRepository.create({
      tenant: user.tenant,
      area: data.area,
      slug,
      title: data.title,
      aliases: [],
      body: data.body,
      sensitivity,
      visible_to: data.visible_to ?? [],
      headings: parsed.headings,
      blocks: parsed.blocks,
      outlinks,
      unresolved,
      version: 1,
      updated_by: new Types.ObjectId(user.id),
      status: 'active',
    })

    await this.noteVersionRepository.append({
      note_id: note._id,
      tenant: user.tenant,
      version: 1,
      title: note.title,
      body: note.body,
      sensitivity: note.sensitivity,
      visible_to: note.visible_to,
      edited_by: new Types.ObjectId(user.id),
    })

    const danglings = await this.noteRepository.findDanglings(user.tenant, slug)
    for (const dangling of danglings) {
      const edge: Outlink = {
        target_id: note._id,
        target_slug: slug,
        display: slug,
        source_heading: '',
        source_block: '',
        target_anchor: null,
        count: 1,
      }
      await this.noteRepository.resolveDangling(dangling._id.toString(), slug, edge)
    }

    const edges: Edge[] = outlinks.map((o) => ({
      target_id: o.target_id,
      target_slug: o.target_slug,
      display: o.display,
      source_heading: o.source_heading,
      source_block: o.source_block,
      target_anchor: o.target_anchor,
    }))
    this.nameIndexService.addNote(user.tenant, note._id.toString(), slug, [], edges)

    return note
  }

  async update(
    id: string,
    patch: UpdateNotePatch,
    baseVersion: number,
    user: UserProfile,
  ): Promise<NoteDocument> {
    const note = await this.noteRepository.findById(user.tenant, id)
    if (!note) throw new NotFoundException()
    if (!this.permissionService.canEdit(user, note)) throw new ForbiddenException()
    if (note.version !== baseVersion) throw new ConflictException('Version conflict — reload and retry')

    await this.noteVersionRepository.append({
      note_id: note._id,
      tenant: user.tenant,
      version: note.version,
      title: note.title,
      body: note.body,
      sensitivity: note.sensitivity,
      visible_to: note.visible_to,
      edited_by: new Types.ObjectId(user.id),
    })

    const updateData: Partial<Note> = {
      ...patch,
      version: note.version + 1,
      updated_by: new Types.ObjectId(user.id),
    }

    if (patch.body !== undefined) {
      const parsed = this.parserService.parse(patch.body)
      const outlinks: Outlink[] = []
      const unresolved: { name: string; source_block: string }[] = []

      for (const link of parsed.links) {
        const targetId = this.nameIndexService.resolveSlug(user.tenant, link.name)
        if (targetId) {
          outlinks.push({
            target_id: new Types.ObjectId(targetId),
            target_slug: link.name,
            display: link.display,
            source_heading: link.source_heading,
            source_block: link.source_block,
            target_anchor: link.anchor,
            count: 1,
          })
        } else {
          unresolved.push({ name: link.name, source_block: link.source_block })
        }
      }
      updateData.headings = parsed.headings
      updateData.blocks = parsed.blocks
      updateData.outlinks = outlinks
      updateData.unresolved = unresolved
    }

    const updated = await this.noteRepository.update(user.tenant, id, updateData)
    if (!updated) throw new NotFoundException()

    const edges: Edge[] = (updated.outlinks ?? []).map((o) => ({
      target_id: o.target_id,
      target_slug: o.target_slug,
      display: o.display,
      source_heading: o.source_heading,
      source_block: o.source_block,
      target_anchor: o.target_anchor,
    }))
    this.nameIndexService.updateNote(user.tenant, id, updated.slug, updated.aliases ?? [], edges)

    return updated
  }

  async getMyContext(user: UserProfile): Promise<{
    email: string
    role: string
    tenant: string
    areas: { key: string; name: string; description?: string; default_sensitivity?: string }[]
    note_counts: Record<string, number>
  }> {
    const [allAreas, notes] = await Promise.all([
      this.areaRepository.findAllByTenant(user.tenant),
      this.noteRepository.list(user.tenant, user.areas, undefined, 500),
    ])

    const accessibleAreas =
      user.role === 'admin'
        ? allAreas
        : allAreas.filter((a) => user.areas.includes(a.key))

    const note_counts: Record<string, number> = {}
    for (const area of accessibleAreas) {
      note_counts[area.key] = notes.filter((n) => n.area === area.key).length
    }

    return {
      email: user.email,
      role: user.role,
      tenant: user.tenant,
      areas: accessibleAreas.map((a) => ({
        key: a.key,
        name: a.name,
        description: a.description,
        default_sensitivity: a.default_sensitivity,
      })),
      note_counts,
    }
  }

  async delete(id: string, baseVersion: number, user: UserProfile): Promise<void> {
    const note = await this.noteRepository.findById(user.tenant, id)
    if (!note) throw new NotFoundException()
    if (!this.permissionService.canEdit(user, note)) throw new ForbiddenException()
    if (note.version !== baseVersion) throw new ConflictException('Version conflict')

    await this.noteRepository.softDelete(user.tenant, id)
    await this.noteRepository.unresolveOutlinks(user.tenant, id)
    this.nameIndexService.removeNote(user.tenant, id, note.slug, note.aliases ?? [])
  }
}
