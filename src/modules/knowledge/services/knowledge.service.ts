import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Types } from 'mongoose'
import { NoteRepository } from '@/repository/schemas/note/note.repository'
import { NoteVersionRepository } from '@/repository/schemas/note-version/note-version.repository'
import { AreaRepository } from '@/repository/schemas/area/area.repository'
import { AreaDocument } from '@/repository/schemas/area/area.schema'
import { UserProfile, isTenantAdmin, readableAreas } from '@/tools/user-profile.type'
import { AreaAccess, ContentStatus, LinkDirection, NoteKind, Sensitivity } from '@/commons/enums'
import { PermissionService } from './permission.service'
import { ParserService } from './parser.service'
import { NameIndexService, Edge } from './name-index.service'
import { Note, NoteDocument, Outlink } from '@/repository/schemas/note/note.schema'
import { OrganizationRepository } from '@/repository/schemas/organization/organization.repository'
import { unlinkWikiReferences } from './wikilink-cleaner'

function normalizeSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúüñ]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ─── System page templates (area scaffold) ──────────────────────────────────

function indexTemplate(areaName: string): string {
  return `> ⚙️ System page — **Map of Content** for the "${areaName}" area. This is the entry point for navigation: every note in this area should be reachable from here.

## How to maintain this index
- One entry per note: \`- [[Note Title]] — one-line summary of what it contains.\`
- Group entries under thematic \`##\` headings; create/rename headings as topics evolve.
- Update this index **every time** you create, rename, or archive a note in this area.
- Keep it curated, not exhaustive prose: it is a map, not an article.

## Topics
_(no notes indexed yet — when you first work in this area, list existing notes with kb_list and populate this index)_
`
}

function logTemplate(areaName: string): string {
  return `> ⚙️ System page — **append-only activity log** for the "${areaName}" area. Newest entries at the bottom. Never rewrite or delete previous entries.

Entry format: \`- {YYYY-MM-DD} {INGEST|LINT|NOTE}: {short description}\`

## Log
`
}

export interface CreateNoteData {
  area: string
  title: string
  body: string
  sensitivity?: string
  visible_to?: string[]
}

export interface BatchCreateNoteData extends CreateNoteData {
  slug?: string
  aliases?: string[]
  kind?: NoteKind
}

export interface BatchCreateResult {
  created: NoteDocument[]
  connections: {
    resolved: number
    within_batch: number
    existing: number
    unresolved: number
    repaired_dangling: number
  }
}

export interface UpdateNotePatch {
  body?: string
  title?: string
  sensitivity?: string
  visible_to?: string[]
}

export interface GetNoteOptions {
  mode?: 'preview' | 'full'
  heading?: string
  max_chars?: number
}

const DEFAULT_PREVIEW_CHARS = 1800
const MAX_PREVIEW_CHARS = 6000

@Injectable()
export class KnowledgeService {
  constructor(
    private readonly noteRepository: NoteRepository,
    private readonly noteVersionRepository: NoteVersionRepository,
    private readonly areaRepository: AreaRepository,
    private readonly permissionService: PermissionService,
    private readonly parserService: ParserService,
    private readonly nameIndexService: NameIndexService,
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  // ─── READ ────────────────────────────────────────────────────────────────

  /** Areas the user can read from. Tenant admins see every area of their tenant. */
  private async resolveReadableAreas(user: UserProfile): Promise<string[]> {
    if (isTenantAdmin(user)) {
      const allAreas = await this.areaRepository.findAllByTenant(user.tenant)
      return allAreas.map((a) => a.key)
    }
    return readableAreas(user)
  }

  async search(query: string, user: UserProfile, limit = 10): Promise<NoteDocument[]> {
    const areas = await this.resolveReadableAreas(user)
    return this.noteRepository.search({ tenant: user.tenant, areas, query, limit })
  }

  /**
   * Navigation entry point (Obsidian/Karpathy style): returns the user's accessible
   * areas with their access level and the slug of each area's index (Map of Content)
   * and activity log. Lazily creates missing index/log pages.
   */
  async home(user: UserProfile): Promise<{
    user: { email: string; role: string; tenant: string }
    areas: {
      key: string
      name: string
      description?: string
      access: string
      index: string
      log: string
    }[]
  }> {
    const allAreas = await this.areaRepository.findAllByTenant(user.tenant)
    const accessible = isTenantAdmin(user) ? allAreas : allAreas.filter((a) => readableAreas(user).includes(a.key))

    const areas = await Promise.all(
      accessible.map(async (a) => {
        const scaffold = await this.ensureAreaScaffold(a, user)
        return {
          key: a.key,
          name: a.name,
          description: a.description,
          access: this.permissionService.accessTo(user, a.key),
          index: scaffold.index,
          log: scaffold.log,
        }
      }),
    )

    return {
      user: { email: user.email, role: user.role, tenant: user.tenant },
      areas,
    }
  }

  /** Creates the area's index (MOC) and log pages if missing. Idempotent. */
  private async ensureAreaScaffold(area: AreaDocument, user: UserProfile): Promise<{ index: string; log: string }> {
    const indexSlug = `${area.key}-index`
    const logSlug = `${area.key}-log`
    const sensitivity = area.default_sensitivity ?? Sensitivity.PUBLIC_ORG

    const [existingIndex, existingLog] = await Promise.all([
      this.noteRepository.findByAreaKind(user.tenant, area.key, NoteKind.INDEX),
      this.noteRepository.findByAreaKind(user.tenant, area.key, NoteKind.LOG),
    ])

    // Slug collisions with pre-existing regular notes are tolerated: the slug
    // simply points at that note until it is renamed or re-kinded.
    if (!existingIndex) {
      try {
        await this.insertNote(
          {
            area: area.key,
            title: `${area.name} — Index`,
            body: indexTemplate(area.name),
            sensitivity,
            slug: indexSlug,
            kind: NoteKind.INDEX,
          },
          user,
        )
      } catch (err) {
        if (!(err instanceof ConflictException)) throw err
      }
    }

    if (!existingLog) {
      try {
        await this.insertNote(
          {
            area: area.key,
            title: `${area.name} — Log`,
            body: logTemplate(area.name),
            sensitivity,
            slug: logSlug,
            kind: NoteKind.LOG,
          },
          user,
        )
      } catch (err) {
        if (!(err instanceof ConflictException)) throw err
      }
    }

    return {
      index: existingIndex?.slug ?? indexSlug,
      log: existingLog?.slug ?? logSlug,
    }
  }

  /** Note served for display: body has links to unauthorized targets redacted. */
  async getRedacted(ref: string, user: UserProfile, options: GetNoteOptions = {}): Promise<Record<string, unknown>> {
    const note = await this.get(ref, user)
    const body = await this.redactBody(note, user)
    const selected = options.heading ? this.extractHeadingSection(body, options.heading) : body
    if (selected === null) throw new NotFoundException(`Heading not found: ${options.heading}`)

    return this.serializeNote(note, selected, options, body.length)
  }

  private serializeNote(
    note: NoteDocument,
    selectedBody: string,
    options: GetNoteOptions,
    fullBodyLength: number,
  ): Record<string, unknown> {
    const raw = note.toObject() as unknown as Record<string, unknown>
    const { body: _body, blocks, updated_by: _updatedBy, __v: _versionKey, ...metadata } = raw
    const mode = options.mode ?? 'preview'

    if (mode === 'full') {
      return {
        ...metadata,
        body: selectedBody,
        body_length: selectedBody.length,
        full_body_length: fullBodyLength,
        block_count: Array.isArray(blocks) ? blocks.length : 0,
        body_truncated: false,
      }
    }

    const maxChars = Math.min(options.max_chars ?? DEFAULT_PREVIEW_CHARS, MAX_PREVIEW_CHARS)
    const body = this.truncateMarkdown(selectedBody, maxChars)

    return {
      ...metadata,
      body,
      body_length: selectedBody.length,
      full_body_length: fullBodyLength,
      block_count: Array.isArray(blocks) ? blocks.length : 0,
      body_truncated: body.length < selectedBody.length,
      read_more: options.heading
        ? 'Call kb_get with mode: "full" and the same heading to read the complete section.'
        : 'Call kb_get with mode: "full", or pass heading to read only one section.',
    }
  }

  private truncateMarkdown(body: string, maxChars: number): string {
    if (body.length <= maxChars) return body

    const truncated = body.slice(0, maxChars)
    const lastBreak = Math.max(truncated.lastIndexOf('\n\n'), truncated.lastIndexOf('\n'))
    const cut = lastBreak >= Math.floor(maxChars * 0.6) ? truncated.slice(0, lastBreak) : truncated
    return `${cut.trimEnd()}\n\n[truncated]`
  }

  private extractHeadingSection(body: string, heading: string): string | null {
    const lines = body.split('\n')
    const target = this.normalizeHeading(heading)

    let start = -1
    let level = 0

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^(#{1,6})\s+(.+)$/)
      if (!match) continue
      if (this.normalizeHeading(match[2]) === target) {
        start = i
        level = match[1].length
        break
      }
    }

    if (start === -1) return null

    let end = lines.length
    for (let i = start + 1; i < lines.length; i++) {
      const match = lines[i].match(/^(#{1,6})\s+(.+)$/)
      if (match && match[1].length <= level) {
        end = i
        break
      }
    }

    return lines.slice(start, end).join('\n').trim()
  }

  private normalizeHeading(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/^#+\s*/, '')
      .replace(/[^a-z0-9áéíóúüñ]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  /**
   * Replaces [[wikilinks]] whose target the reader cannot view with a restricted
   * marker. Applied only to the served copy — the stored body is never modified.
   * Dangling links (target does not exist yet) are left untouched.
   */
  private async redactBody(note: NoteDocument, user: UserProfile): Promise<string> {
    const wikilink = /\[\[([^\]]+)\]\]/g
    const matches = [...note.body.matchAll(wikilink)]
    if (matches.length === 0) return note.body

    // Resolve each unique link name to a note id via the in-memory name index
    const idByName = new Map<string, string | undefined>()
    for (const m of matches) {
      const name = normalizeSlug(m[1].split('#')[0])
      if (!idByName.has(name)) {
        idByName.set(name, this.nameIndexService.resolveSlug(user.tenant, name) ?? undefined)
      }
    }

    const ids = [...new Set([...idByName.values()].filter((id): id is string => Boolean(id)))]
    if (ids.length === 0) return note.body

    const targets = await this.noteRepository.findByIds(user.tenant, ids)
    const denied = new Set(targets.filter((t) => !this.permissionService.canView(user, t)).map((t) => t._id.toString()))
    if (denied.size === 0) return note.body

    return note.body.replace(wikilink, (full, inner: string) => {
      const id = idByName.get(normalizeSlug(inner.split('#')[0]))
      return id && denied.has(id) ? '🔒 *[restricted]*' : full
    })
  }

  async get(ref: string, user: UserProfile): Promise<NoteDocument> {
    const note = await this.noteRepository.findBySlugOrAlias(user.tenant, ref)
    if (!note) throw new NotFoundException(`Note not found: ${ref}`)
    if (!this.permissionService.canView(user, note)) throw new ForbiddenException()
    return note
  }

  async links(
    ref: string,
    dir: LinkDirection,
    user: UserProfile,
  ): Promise<{ out: (Edge | null)[]; in: (Edge | null)[] }> {
    const note = await this.get(ref, user)
    const noteId = note._id.toString()

    const filterEdge = async (edge: Edge): Promise<boolean> => {
      const targetNote = await this.noteRepository.findById(user.tenant, edge.target_id.toString())
      if (!targetNote) return false
      return this.permissionService.canView(user, targetNote)
    }

    const out = dir !== LinkDirection.IN ? this.nameIndexService.getOutEdges(noteId) : []
    const inn = dir !== LinkDirection.OUT ? this.nameIndexService.getInEdges(noteId) : []

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
    const areas = await this.resolveReadableAreas(user)
    return this.noteRepository.list(user.tenant, areas, undefined, limit)
  }

  async listDetailed(user: UserProfile, area?: string, limit = 200): Promise<Record<string, unknown>[]> {
    const areas = await this.resolveReadableAreas(user)
    const notes = await this.noteRepository.listDetailed(user.tenant, areas, area, limit)
    const visible = notes.filter((note) => this.permissionService.canView(user, note))
    const targetIds = [
      ...new Set(visible.flatMap((note) => (note.outlinks ?? []).map((outlink) => outlink.target_id.toString()))),
    ]
    const targets = targetIds.length ? await this.noteRepository.findByIds(user.tenant, targetIds) : []
    const targetsById = new Map(targets.map((target) => [target._id.toString(), target]))

    return Promise.all(
      visible.map(async (note) => this.toHttpNote(note, await this.redactBody(note, user), user, targetsById)),
    )
  }

  async versions(ref: string, user: UserProfile): Promise<Record<string, unknown>[]> {
    const note = await this.get(ref, user)
    const versions = await this.noteVersionRepository.findByNoteId(note._id.toString())
    const uniqueVersions = versions.filter(
      (version, index) => versions.findIndex((candidate) => candidate.version === version.version) === index,
    )
    return uniqueVersions.map((version) => ({
      version: version.version,
      title: version.title,
      body: version.body,
      sensitivity: version.sensitivity,
      visible_to: version.visible_to,
      edited_at: version.edited_at,
      edited_by: version.edited_by?.toString(),
    }))
  }

  async getWorkspaceContext(user: UserProfile): Promise<{
    organization: { slug: string; name: string }
    user: { id: string; email: string; name?: string; role: string; tenant: string }
    areas: {
      key: string
      name: string
      description?: string
      access: string
      default_sensitivity?: string
      note_count: number
    }[]
  }> {
    const context = await this.getMyContext(user)
    const organization = await this.organizationRepository.findBySlug(user.tenant)
    return {
      organization: { slug: user.tenant, name: organization?.name ?? user.tenant },
      user: { id: user.id, email: user.email, name: user.name, role: user.role, tenant: user.tenant },
      areas: context.areas.map((area) => ({
        key: area.key,
        name: area.name,
        description: area.description,
        access: area.can_manage ? AreaAccess.MANAGE : area.can_write ? AreaAccess.WRITE : AreaAccess.READ,
        default_sensitivity: area.default_sensitivity,
        note_count: context.note_counts[area.key] ?? 0,
      })),
    }
  }

  private toHttpNote(
    note: NoteDocument,
    body: string,
    user: UserProfile,
    targetsById: Map<string, NoteDocument>,
  ): Record<string, unknown> {
    return {
      id: note._id.toString(),
      area: note.area,
      slug: note.slug,
      title: note.title,
      kind: note.kind,
      aliases: note.aliases ?? [],
      body,
      sensitivity: note.sensitivity,
      visible_to: note.visible_to,
      version: note.version,
      updated_at: note.updated_at,
      updated_by: note.updated_by?.toString(),
      outlinks: (note.outlinks ?? []).map((outlink) => {
        const target = targetsById.get(outlink.target_id.toString())
        if (!target) {
          return {
            display: outlink.display,
            target_id: null,
            target_slug: null,
            access: 'missing',
          }
        }
        if (!this.permissionService.canView(user, target)) {
          return {
            display: outlink.display,
            target_id: null,
            target_slug: null,
            access: 'restricted',
          }
        }
        return {
          display: outlink.display,
          target_id: target._id.toString(),
          target_slug: target.slug,
          target_title: target.title,
          target_area: target.area,
          access: 'accessible',
        }
      }),
      unresolved: note.unresolved,
    }
  }

  // ─── WRITE ───────────────────────────────────────────────────────────────

  async create(data: CreateNoteData, user: UserProfile): Promise<NoteDocument> {
    const access = this.permissionService.accessTo(user, data.area)
    if (access !== AreaAccess.WRITE && access !== AreaAccess.MANAGE) {
      throw new ForbiddenException('Insufficient permissions to create notes in this area')
    }

    const areaDoc = await this.areaRepository.findByKey(user.tenant, data.area)
    const sensitivity = data.sensitivity ?? areaDoc?.default_sensitivity ?? Sensitivity.PUBLIC_ORG

    return this.insertNote({ ...data, sensitivity }, user)
  }

  async createBatch(data: BatchCreateNoteData[], user: UserProfile): Promise<BatchCreateResult> {
    const areaKeys = [...new Set(data.map((note) => note.area))]
    const areas = new Map<string, AreaDocument>()

    for (const areaKey of areaKeys) {
      const access = this.permissionService.accessTo(user, areaKey)
      if (access !== AreaAccess.WRITE && access !== AreaAccess.MANAGE) {
        throw new ForbiddenException(`Insufficient permissions to create notes in area "${areaKey}"`)
      }
      const area = await this.areaRepository.findByKey(user.tenant, areaKey)
      if (!area) throw new NotFoundException(`Area not found: ${areaKey}`)
      areas.set(areaKey, area)
    }

    const drafts = data.map((note) => {
      const slug = normalizeSlug(note.slug ?? note.title)
      if (!slug) throw new BadRequestException(`Cannot derive a slug for note "${note.title}"`)
      const aliases = [...new Set((note.aliases ?? []).map(normalizeSlug).filter((alias) => alias && alias !== slug))]
      return {
        id: new Types.ObjectId(),
        data: note,
        slug,
        aliases,
        parsed: this.parserService.parse(note.body),
        sensitivity: note.sensitivity ?? areas.get(note.area)?.default_sensitivity ?? Sensitivity.PUBLIC_ORG,
      }
    })

    const draftByName = new Map<string, (typeof drafts)[number]>()
    for (const draft of drafts) {
      for (const name of [draft.slug, ...draft.aliases]) {
        const owner = draftByName.get(name)
        if (owner) {
          throw new ConflictException(`Name "${name}" is shared by "${owner.data.title}" and "${draft.data.title}"`)
        }
        draftByName.set(name, draft)
      }
    }

    const existingNames = await Promise.all(
      [...draftByName.keys()].map(async (name) => ({
        name,
        note: await this.noteRepository.findAnyBySlugOrAlias(user.tenant, name),
      })),
    )
    const collision = existingNames.find((entry) => entry.note)
    if (collision) throw new ConflictException(`A note already uses slug or alias "${collision.name}"`)

    const existingTargetIdByName = new Map<string, string>()
    for (const draft of drafts) {
      for (const link of draft.parsed.links) {
        if (draftByName.has(link.name) || existingTargetIdByName.has(link.name)) continue
        const targetId = this.nameIndexService.resolveSlug(user.tenant, link.name)
        if (targetId) existingTargetIdByName.set(link.name, targetId)
      }
    }

    const existingTargetIds = [...new Set(existingTargetIdByName.values())]
    const existingTargets = existingTargetIds.length
      ? await this.noteRepository.findByIds(user.tenant, existingTargetIds)
      : []
    const existingTargetById = new Map(existingTargets.map((note) => [note._id.toString(), note]))
    let withinBatch = 0
    let existing = 0
    let unresolved = 0

    const records = drafts.map((draft) => {
      const outlinks: Outlink[] = []
      const unresolvedLinks: { name: string; source_block: string }[] = []

      for (const link of draft.parsed.links) {
        const batchTarget = draftByName.get(link.name)
        const existingTargetId = existingTargetIdByName.get(link.name)
        const existingTarget = existingTargetId ? existingTargetById.get(existingTargetId) : undefined
        const targetId = batchTarget?.id ?? existingTarget?._id
        const targetSlug = batchTarget?.slug ?? existingTarget?.slug

        if (targetId && targetSlug) {
          outlinks.push({
            target_id: targetId,
            target_slug: targetSlug,
            display: link.display,
            source_heading: link.source_heading,
            source_block: link.source_block,
            target_anchor: link.anchor,
            count: 1,
          })
          if (batchTarget) withinBatch += 1
          else existing += 1
        } else {
          unresolvedLinks.push({ name: link.name, source_block: link.source_block })
          unresolved += 1
        }
      }

      return {
        _id: draft.id,
        tenant: user.tenant,
        area: draft.data.area,
        slug: draft.slug,
        title: draft.data.title,
        kind: draft.data.kind ?? NoteKind.NOTE,
        aliases: draft.aliases,
        body: draft.data.body,
        sensitivity: draft.sensitivity,
        visible_to: draft.data.visible_to ?? [],
        headings: draft.parsed.headings,
        blocks: draft.parsed.blocks,
        outlinks,
        unresolved: unresolvedLinks,
        version: 1,
        updated_by: new Types.ObjectId(user.id),
        status: ContentStatus.ACTIVE,
      }
    })

    let created: NoteDocument[]
    try {
      created = await this.noteRepository.createMany(records)
      await this.noteVersionRepository.appendMany(
        created.map((note) => ({
          note_id: note._id,
          tenant: user.tenant,
          version: 1,
          title: note.title,
          body: note.body,
          sensitivity: note.sensitivity,
          visible_to: note.visible_to,
          edited_by: new Types.ObjectId(user.id),
        })),
      )
    } catch (error) {
      const ids = drafts.map((draft) => draft.id)
      await Promise.allSettled([
        this.noteVersionRepository.deleteByNoteIds(ids),
        this.noteRepository.deleteByIds(user.tenant, ids),
      ])
      throw error
    }

    let repairedDangling = 0
    for (const draft of drafts) {
      for (const name of [draft.slug, ...draft.aliases]) {
        const danglingNotes = await this.noteRepository.findDanglings(user.tenant, name)
        for (const dangling of danglingNotes) {
          const unresolvedLink = dangling.unresolved.find((link) => link.name === name)
          await this.noteRepository.resolveDangling(dangling._id.toString(), name, {
            target_id: draft.id,
            target_slug: draft.slug,
            display: name,
            source_heading: '',
            source_block: unresolvedLink?.source_block ?? '',
            target_anchor: null,
            count: 1,
          })
          repairedDangling += 1
        }
      }
    }

    await this.nameIndexService.rebuild()

    return {
      created,
      connections: {
        resolved: withinBatch + existing,
        within_batch: withinBatch,
        existing,
        unresolved,
        repaired_dangling: repairedDangling,
      },
    }
  }

  /**
   * Inserts a note without permission checks — create() validates before delegating;
   * ensureAreaScaffold() uses it to create system pages (index/log) on behalf of the system.
   */
  private async insertNote(
    data: CreateNoteData & { sensitivity: string; slug?: string; kind?: string },
    user: UserProfile,
  ): Promise<NoteDocument> {
    const slug = data.slug ?? normalizeSlug(data.title)

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
      kind: data.kind ?? NoteKind.NOTE,
      aliases: [],
      body: data.body,
      sensitivity: data.sensitivity,
      visible_to: data.visible_to ?? [],
      headings: parsed.headings,
      blocks: parsed.blocks,
      outlinks,
      unresolved,
      version: 1,
      updated_by: new Types.ObjectId(user.id),
      status: ContentStatus.ACTIVE,
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

  async update(id: string, patch: UpdateNotePatch, baseVersion: number, user: UserProfile): Promise<NoteDocument> {
    const note = await this.noteRepository.findById(user.tenant, id)
    if (!note) throw new NotFoundException()
    if (!this.permissionService.canEdit(user, note)) throw new ForbiddenException()
    if (note.version !== baseVersion) throw new ConflictException('Version conflict — reload and retry')

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

    await this.noteVersionRepository.append({
      note_id: updated._id,
      tenant: user.tenant,
      version: updated.version,
      title: updated.title,
      body: updated.body,
      sensitivity: updated.sensitivity,
      visible_to: updated.visible_to,
      edited_by: new Types.ObjectId(user.id),
    })

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
    areas: {
      key: string
      name: string
      description?: string
      default_sensitivity?: string
      can_read: boolean
      can_write: boolean
      can_manage: boolean
    }[]
    writable_areas: string[]
    note_counts: Record<string, number>
  }> {
    const allAreas = await this.areaRepository.findAllByTenant(user.tenant)

    const accessibleAreas = isTenantAdmin(user) ? allAreas : allAreas.filter((a) => readableAreas(user).includes(a.key))

    const notes = await this.noteRepository.list(
      user.tenant,
      accessibleAreas.map((a) => a.key),
      undefined,
      500,
    )

    const note_counts: Record<string, number> = {}
    for (const area of accessibleAreas) {
      note_counts[area.key] = notes.filter((n) => n.area === area.key).length
    }

    // Access levels mirror PermissionService.accessTo: read < write < manage.
    const areas = accessibleAreas.map((a) => {
      const access = this.permissionService.accessTo(user, a.key)
      return {
        key: a.key,
        name: a.name,
        description: a.description,
        default_sensitivity: a.default_sensitivity,
        can_read: access !== 'none',
        can_write: access === AreaAccess.WRITE || access === AreaAccess.MANAGE,
        can_manage: access === AreaAccess.MANAGE,
      }
    })

    return {
      email: user.email,
      role: user.role,
      tenant: user.tenant,
      areas,
      writable_areas: areas.filter((a) => a.can_write).map((a) => a.key),
      note_counts,
    }
  }

  async delete(
    id: string,
    baseVersion: number,
    user: UserProfile,
  ): Promise<{ archived: true; broken_connections: number; updated_notes: number }> {
    const note = await this.noteRepository.findById(user.tenant, id)
    if (!note) throw new NotFoundException()
    if (!this.permissionService.canManage(user, note.area)) {
      throw new ForbiddenException('Manage access is required to delete notes')
    }
    if (note.kind !== NoteKind.NOTE) throw new ForbiddenException('System notes cannot be deleted')
    if (note.version !== baseVersion) throw new ConflictException('Version conflict')

    const backlinks = (await this.noteRepository.findBacklinks(user.tenant, id)).filter(
      (source) => source._id.toString() !== id,
    )
    const unauthorized = backlinks.find((source) => !this.permissionService.canEdit(user, source))
    if (unauthorized) {
      throw new ForbiddenException(`Cannot break a reference from area "${unauthorized.area}" without write access`)
    }

    const references = [note.slug, note.title, ...(note.aliases ?? [])]
    let brokenInbound = 0
    let updatedNotes = 0
    for (const source of backlinks) {
      const unlinked = unlinkWikiReferences(source.body, references)
      if (unlinked.removedLinks === 0) continue
      await this.update(source._id.toString(), { body: unlinked.body }, source.version, user)
      brokenInbound += unlinked.removedLinks
      updatedNotes += 1
    }

    const brokenOutbound = (note.outlinks?.length ?? 0) + (note.unresolved?.length ?? 0)
    await this.noteRepository.softDelete(user.tenant, id)
    this.nameIndexService.removeNote(user.tenant, id, note.slug, note.aliases ?? [])
    return {
      archived: true,
      broken_connections: brokenInbound + brokenOutbound,
      updated_notes: updatedNotes,
    }
  }
}
