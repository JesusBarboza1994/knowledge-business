import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Types } from 'mongoose'
import { NOTE_REFERENCE_FIELDS, NoteRepository } from '@/repository/schemas/note/note.repository'
import { NoteVersionRepository } from '@/repository/schemas/note-version/note-version.repository'
import { AreaRepository } from '@/repository/schemas/area/area.repository'
import { AreaDocument } from '@/repository/schemas/area/area.schema'
import { UserProfile, isTenantAdmin, readableAreas } from '@/tools/user-profile.type'
import { AreaAccess, ContentStatus, LinkDirection, NoteKind, Sensitivity } from '@/commons/enums'
import { PermissionService } from './permission.service'
import { ParserService } from './parser.service'
import { NameIndexService, Edge } from './name-index.service'
import { AssetService } from './asset.service'
import { Note, NoteDocument, Outlink } from '@/repository/schemas/note/note.schema'
import { OrganizationRepository } from '@/repository/schemas/organization/organization.repository'

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

export interface MoveNotePatch {
  area?: string
  sensitivity?: string
  visible_to?: string[]
}

export interface GetNoteOptions {
  mode?: 'preview' | 'full'
  heading?: string
  max_chars?: number
}

export interface ListNotesOptions {
  area?: string
  limit?: number
  includeBody?: boolean
}

export interface ListNotesResult {
  items: Record<string, unknown>[]
  total: number
  limit: number
  truncated: boolean
}

const DEFAULT_PREVIEW_CHARS = 1800
const MAX_PREVIEW_CHARS = 6000
const WIKILINK = /\[\[([^\]]+)\]\]/g
const RESTRICTED_MARKER = '🔒 *[restricted]*'

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
    private readonly assetService: AssetService,
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

  async search(query: string, user: UserProfile, limit = 10, area?: string): Promise<NoteDocument[]> {
    const areas = await this.resolveReadableAreas(user)
    return this.noteRepository.search({ tenant: user.tenant, areas, query, limit, area })
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

  /**
   * Note served for display: links to unauthorized targets are redacted in the body and
   * reported as `restricted` in the outlinks, matching the shape of the workspace listing.
   */
  async getRedacted(ref: string, user: UserProfile, options: GetNoteOptions = {}): Promise<Record<string, unknown>> {
    const note = await this.get(ref, user)

    const idByName = this.resolveLinkTargets(note.body, user.tenant)
    const referenceIds = [
      ...new Set([...(note.outlinks ?? []).map((outlink) => outlink.target_id.toString()), ...idByName.values()]),
    ]
    const references = referenceIds.length
      ? await this.noteRepository.findByIds(user.tenant, referenceIds, NOTE_REFERENCE_FIELDS)
      : []
    const referencesById = new Map(references.map((reference) => [reference._id.toString(), reference]))

    const body = this.redactBodyWith(note.body, idByName, this.deniedIds(references, user))
    const selected = options.heading ? this.extractHeadingSection(body, options.heading) : body
    if (selected === null) throw new NotFoundException(`Heading not found: ${options.heading}`)

    return this.serializeNote(note, selected, options, body.length, user, referencesById)
  }

  private serializeNote(
    note: NoteDocument,
    selectedBody: string,
    options: GetNoteOptions,
    fullBodyLength: number,
    user: UserProfile,
    referencesById: Map<string, NoteDocument>,
  ): Record<string, unknown> {
    const raw = note.toObject() as unknown as Record<string, unknown>
    const { body: _body, blocks, __v: _versionKey, ...rest } = raw
    const mode = options.mode ?? 'preview'
    const metadata = {
      ...rest,
      id: note._id.toString(),
      updated_by: note.updated_by?.toString(),
      outlinks: this.outlinksFor(note, user, referencesById),
    }

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

  /** Resolves every [[wikilink]] name in a body to its target id, skipping dangling ones. */
  private resolveLinkTargets(body: string, tenant: string, into = new Map<string, string>()): Map<string, string> {
    for (const match of body.matchAll(WIKILINK)) {
      const name = normalizeSlug(match[1].split('#')[0])
      if (into.has(name)) continue
      const id = this.nameIndexService.resolveSlug(tenant, name)
      if (id) into.set(name, id)
    }
    return into
  }

  /**
   * Replaces [[wikilinks]] whose target the reader cannot view with a restricted marker.
   * Pure — the caller supplies the resolved targets, so a listing can redact many bodies
   * from a single lookup. Applied only to the served copy; the stored body is never modified.
   * Dangling links (target does not exist yet) are left untouched.
   */
  private redactBodyWith(body: string, idByName: Map<string, string>, denied: Set<string>): string {
    if (denied.size === 0) return body
    return body.replace(WIKILINK, (full, inner: string) => {
      const id = idByName.get(normalizeSlug(inner.split('#')[0]))
      return id && denied.has(id) ? RESTRICTED_MARKER : full
    })
  }

  /**
   * The slug check and the insert are not atomic, so a concurrent create can still lose the
   * race against the unique index. Report that as the conflict it is, not as a 500.
   */
  private async createOrConflict(data: Partial<Note>): Promise<NoteDocument> {
    try {
      return await this.noteRepository.create(data)
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        throw new ConflictException(`A note with slug "${data.slug}" already exists`)
      }
      throw error
    }
  }

  private deniedIds(notes: NoteDocument[], user: UserProfile): Set<string> {
    return new Set(
      notes.filter((note) => !this.permissionService.canView(user, note)).map((note) => note._id.toString()),
    )
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

    const out = dir !== LinkDirection.IN ? this.nameIndexService.getOutEdges(noteId) : []
    const inn = dir !== LinkDirection.OUT ? this.nameIndexService.getInEdges(noteId) : []

    // One lookup for every edge on both sides, instead of one per edge.
    const ids = [...new Set([...out, ...inn].map((edge) => edge.target_id.toString()))]
    const reachable = ids.length ? await this.noteRepository.findByIds(user.tenant, ids, NOTE_REFERENCE_FIELDS) : []
    const visible = new Set(
      reachable.filter((target) => this.permissionService.canView(user, target)).map((target) => target._id.toString()),
    )
    const keep = (edges: Edge[]) => edges.filter((edge) => visible.has(edge.target_id.toString()))

    return { out: keep(out), in: keep(inn) }
  }

  async list(user: UserProfile, limit = 50): Promise<NoteDocument[]> {
    const areas = await this.resolveReadableAreas(user)
    return this.noteRepository.list(user.tenant, areas, undefined, limit)
  }

  /**
   * Workspace map. Resolves every referenced note — outlink targets plus, when bodies are
   * requested, the targets of every [[wikilink]] — in a single lookup, so the cost is constant
   * in the number of notes returned instead of one query per note.
   */
  async listDetailed(user: UserProfile, options: ListNotesOptions = {}): Promise<ListNotesResult> {
    const { area, limit = 200, includeBody = false } = options
    const areas = await this.resolveReadableAreas(user)

    const [notes, total] = await Promise.all([
      this.noteRepository.listDetailed(user.tenant, areas, { area, limit, includeBody }),
      this.noteRepository.countInScope(user.tenant, areas, area),
    ])
    const visible = notes.filter((note) => this.permissionService.canView(user, note))

    const idByName = new Map<string, string>()
    if (includeBody) {
      for (const note of visible) this.resolveLinkTargets(note.body ?? '', user.tenant, idByName)
    }

    const referenceIds = [
      ...new Set([
        ...visible.flatMap((note) => (note.outlinks ?? []).map((outlink) => outlink.target_id.toString())),
        ...idByName.values(),
      ]),
    ]
    const references = referenceIds.length
      ? await this.noteRepository.findByIds(user.tenant, referenceIds, NOTE_REFERENCE_FIELDS)
      : []
    const referencesById = new Map(references.map((reference) => [reference._id.toString(), reference]))
    const denied = this.deniedIds(references, user)

    const items = visible.map((note) =>
      this.toHttpNote(
        note,
        user,
        referencesById,
        includeBody ? this.redactBodyWith(note.body ?? '', idByName, denied) : undefined,
      ),
    )

    return { items, total, limit, truncated: total > notes.length }
  }

  /** History is redacted like the live note: a reader must not recover a restricted link from it. */
  async versions(ref: string, user: UserProfile): Promise<Record<string, unknown>[]> {
    const note = await this.get(ref, user)
    const versions = await this.noteVersionRepository.findByNoteId(note._id.toString())
    const uniqueVersions = versions.filter(
      (version, index) => versions.findIndex((candidate) => candidate.version === version.version) === index,
    )

    const idByName = new Map<string, string>()
    for (const version of uniqueVersions) this.resolveLinkTargets(version.body ?? '', user.tenant, idByName)
    const targets = idByName.size
      ? await this.noteRepository.findByIds(user.tenant, [...new Set(idByName.values())], NOTE_REFERENCE_FIELDS)
      : []
    const denied = this.deniedIds(targets, user)

    return uniqueVersions.map((version) => ({
      version: version.version,
      title: version.title,
      body: this.redactBodyWith(version.body ?? '', idByName, denied),
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

  /** `body` is omitted entirely when the caller did not ask for content. */
  private toHttpNote(
    note: NoteDocument,
    user: UserProfile,
    targetsById: Map<string, NoteDocument>,
    body?: string,
  ): Record<string, unknown> {
    return {
      id: note._id.toString(),
      area: note.area,
      slug: note.slug,
      title: note.title,
      kind: note.kind,
      aliases: note.aliases ?? [],
      ...(body === undefined ? {} : { body }),
      sensitivity: note.sensitivity,
      visible_to: note.visible_to,
      version: note.version,
      updated_at: note.updated_at,
      updated_by: note.updated_by?.toString(),
      outlinks: this.outlinksFor(note, user, targetsById),
      unresolved: note.unresolved,
    }
  }

  /**
   * Outlinks as the client sees them. A target the reader cannot view is reported as
   * `restricted` with its identity stripped — never as a usable reference.
   */
  private outlinksFor(
    note: NoteDocument,
    user: UserProfile,
    targetsById: Map<string, NoteDocument>,
  ): Record<string, unknown>[] {
    return (note.outlinks ?? []).map((outlink) => {
      const target = targetsById.get(outlink.target_id.toString())
      if (!target) {
        return { display: outlink.display, target_id: null, target_slug: null, access: 'missing' }
      }
      if (!this.permissionService.canView(user, target)) {
        return { display: outlink.display, target_id: null, target_slug: null, access: 'restricted' }
      }
      return {
        display: outlink.display,
        target_id: target._id.toString(),
        target_slug: target.slug,
        target_title: target.title,
        target_area: target.area,
        access: 'accessible',
      }
    })
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

    // Drafts and created records line up by index: createMany preserves the input order.
    for (const [index, note] of created.entries()) {
      const assets = drafts[index]?.parsed.assets.map((asset) => asset.id) ?? []
      if (assets.length > 0) await this.assetService.syncNoteUsage(note, assets)
    }

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

    const note = await this.createOrConflict({
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

    // Repair pending links under every name this note answers to, as createBatch does.
    for (const name of [slug, ...(note.aliases ?? [])]) {
      const danglings = await this.noteRepository.findDanglings(user.tenant, name)
      for (const dangling of danglings) {
        const unresolvedLink = dangling.unresolved.find((link) => link.name === name)
        await this.noteRepository.resolveDangling(dangling._id.toString(), name, {
          target_id: note._id,
          target_slug: slug,
          display: name,
          source_heading: '',
          source_block: unresolvedLink?.source_block ?? '',
          target_anchor: null,
          count: 1,
        })
      }
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

    await this.assetService.syncNoteUsage(
      note,
      parsed.assets.map((asset) => asset.id),
    )

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

    /**
     * Only recomputed when the body changed. A patch that only touches sensitivity still has to
     * reach syncNoteUsage, so the existing embeds are reused rather than left unsynced — that is
     * what makes "raise an asset's visibility with its note" work on a visibility-only edit.
     */
    let embeddedAssets = this.parserService.parse(note.body).assets.map((asset) => asset.id)

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
      embeddedAssets = parsed.assets.map((asset) => asset.id)
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

    await this.assetService.syncNoteUsage(updated, embeddedAssets)

    return updated
  }

  /**
   * Reclassifies a note without touching its body: change the area it belongs to and/or its
   * sensitivity. Moving to another area requires write access in *both* the source (current) and
   * the target area, so a note can never be pushed into an area the caller could not write to
   * directly. The slug, aliases and [[link]] graph are name-scoped per tenant, not per area, so a
   * move leaves them — and every inbound backlink — untouched.
   */
  async move(id: string, patch: MoveNotePatch, baseVersion: number, user: UserProfile): Promise<NoteDocument> {
    const note = await this.noteRepository.findById(user.tenant, id)
    if (!note) throw new NotFoundException()
    if (!this.permissionService.canEdit(user, note)) throw new ForbiddenException()
    if (note.version !== baseVersion) throw new ConflictException('Version conflict — reload and retry')

    const updateData: Partial<Note> = {
      version: note.version + 1,
      updated_by: new Types.ObjectId(user.id),
    }

    if (patch.area !== undefined && patch.area !== note.area) {
      if (note.kind !== NoteKind.NOTE) throw new ForbiddenException('System notes cannot be moved between areas')
      const target = await this.areaRepository.findByKey(user.tenant, patch.area)
      if (!target) throw new NotFoundException(`Area not found: ${patch.area}`)
      if (!this.permissionService.canWriteTo(user, target.key)) {
        throw new ForbiddenException(`Write access is required in target area "${target.key}" to move a note into it`)
      }
      updateData.area = target.key
    }

    if (patch.sensitivity !== undefined) updateData.sensitivity = patch.sensitivity
    if (patch.visible_to !== undefined) updateData.visible_to = patch.visible_to

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

    // Counted in Mongo: loading documents to count them capped every area at the page size.
    const counts = await this.noteRepository.countByArea(
      user.tenant,
      accessibleAreas.map((a) => a.key),
    )

    const note_counts: Record<string, number> = {}
    for (const area of accessibleAreas) {
      note_counts[area.key] = counts[area.key] ?? 0
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

  /**
   * Archives a note and leaves every inbound [[wikilink]] in place as a pending one, so the
   * graph rebuilds itself if the note is recreated under the same name. The source texts are
   * never rewritten — only the derived edges change.
   */
  async delete(
    id: string,
    baseVersion: number,
    user: UserProfile,
  ): Promise<{ archived: true; pending_connections: number; updated_notes: number }> {
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
      throw new ForbiddenException(
        `Cannot leave a reference pending in area "${unauthorized.area}" without write access`,
      )
    }

    const { sourceIds, connections } = await this.noteRepository.unresolveOutlinks(user.tenant, id)

    await this.noteRepository.softDelete(user.tenant, id)
    this.nameIndexService.removeNote(user.tenant, id, note.slug, note.aliases ?? [])
    this.nameIndexService.detachEdgesTo(sourceIds, id)
    await this.assetService.detachNote(user.tenant, note._id)

    return {
      archived: true,
      pending_connections: connections,
      updated_notes: sourceIds.length,
    }
  }
}
