import { describe, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'
import { AreaAccess, Sensitivity, UserRole } from '@/commons/enums'
import { NoteDocument } from '@/repository/schemas/note/note.schema'
import { UserProfile } from '@/tools/user-profile.type'
import { KnowledgeService } from './knowledge.service'
import { ParserService } from './parser.service'

function note(overrides: Partial<NoteDocument>): NoteDocument {
  return {
    _id: new Types.ObjectId(),
    tenant: 'mente2',
    area: 'develop',
    slug: 'origen',
    title: 'Origen',
    kind: 'note',
    aliases: [],
    body: '',
    sensitivity: Sensitivity.INTERNAL_AREA,
    visible_to: ['develop'],
    outlinks: [],
    unresolved: [],
    version: 1,
    ...overrides,
  } as NoteDocument
}

/** Asset usage tracking is a side effect of every write; these specs only assert the note layer. */
function assetServiceStub() {
  return { syncNoteUsage: vi.fn().mockResolvedValue(undefined), detachNote: vi.fn().mockResolvedValue(undefined) }
}

function serviceWith(source: NoteDocument, target: NoteDocument, canViewTarget: boolean) {
  return build({ notes: [source], references: [target], canView: (candidate) => candidate !== target || canViewTarget })
    .service
}

function build(options: {
  notes: NoteDocument[]
  references?: NoteDocument[]
  canView?: (note: NoteDocument) => boolean
  total?: number
  resolveSlug?: (name: string) => string | undefined
}) {
  const { notes, references = [], canView = () => true, total = notes.length, resolveSlug = () => undefined } = options
  const noteRepository = {
    listDetailed: vi.fn().mockResolvedValue(notes),
    countInScope: vi.fn().mockResolvedValue(total),
    findByIds: vi.fn().mockResolvedValue(references),
  }
  const permissionService = { canView: vi.fn((_user: UserProfile, note: NoteDocument) => canView(note)) }
  const nameIndexService = { resolveSlug: vi.fn((_tenant: string, name: string) => resolveSlug(name)) }
  const assetService = assetServiceStub()
  const service = new KnowledgeService(
    noteRepository as never,
    {} as never,
    {} as never,
    permissionService as never,
    {} as never,
    nameIndexService as never,
    {} as never,
    assetService as never,
  )
  return { service, noteRepository, permissionService, nameIndexService, assetService }
}

const user: UserProfile = {
  id: new Types.ObjectId().toString(),
  email: 'user@mente2.com',
  tenant: 'mente2',
  role: UserRole.MEMBER,
  memberships: [{ area: 'develop', access: AreaAccess.WRITE }],
}

describe('KnowledgeService HTTP outlinks', () => {
  it('expone el slug canónico del destino cuando el usuario puede verlo', async () => {
    const target = note({ area: 'product', slug: 'destino-canonico', title: 'Destino canónico' })
    const source = note({
      outlinks: [
        {
          target_id: target._id,
          target_slug: 'alias-del-destino',
          display: 'Alias del destino',
          source_heading: '',
          source_block: 'b_00',
          target_anchor: null,
          count: 1,
        },
      ],
    })

    const { items } = await serviceWith(source, target, true).listDetailed(user)

    expect(items[0].outlinks).toEqual([
      expect.objectContaining({
        target_id: target._id.toString(),
        target_slug: 'destino-canonico',
        target_area: 'product',
        access: 'accessible',
      }),
    ])
  })

  it('no expone metadatos del destino cuando el usuario no tiene acceso', async () => {
    const target = note({ area: 'finance', slug: 'presupuesto-confidencial' })
    const source = note({
      outlinks: [
        {
          target_id: target._id,
          target_slug: target.slug,
          display: 'Presupuesto confidencial',
          source_heading: '',
          source_block: 'b_00',
          target_anchor: null,
          count: 1,
        },
      ],
    })

    const { items } = await serviceWith(source, target, false).listDetailed(user)

    expect(items[0].outlinks).toEqual([
      {
        display: 'Presupuesto confidencial',
        target_id: null,
        target_slug: null,
        access: 'restricted',
      },
    ])
  })
})

describe('KnowledgeService workspace listing', () => {
  it('resuelve los destinos de todas las notas en una sola consulta', async () => {
    const targets = ['uno', 'dos', 'tres'].map((name) => note({ slug: `destino-${name}`, title: `Destino ${name}` }))
    const idByName = new Map(targets.map((target) => [target.slug, target._id.toString()]))
    const sources = ['uno', 'dos', 'tres'].map((name, index) =>
      note({ slug: `origen-${index}`, body: `Consulta [[destino-${name}]] y [[destino-uno]].` }),
    )
    const { service, noteRepository } = build({
      notes: sources,
      references: targets,
      resolveSlug: (name) => idByName.get(name),
    })

    const { items } = await service.listDetailed(user, { includeBody: true })

    expect(items).toHaveLength(3)
    expect(noteRepository.findByIds).toHaveBeenCalledOnce()
    expect(noteRepository.findByIds.mock.calls[0][1]).toEqual([...idByName.values()])
  })

  it('censura los enlaces a notas sin acceso reutilizando la misma consulta', async () => {
    const restricted = note({ slug: 'presupuesto', area: 'finance' })
    const sources = [
      note({ slug: 'origen-a', body: 'Ver [[presupuesto]].' }),
      note({ slug: 'origen-b', body: 'También [[presupuesto#2026]].' }),
    ]
    const { service, noteRepository } = build({
      notes: sources,
      references: [restricted],
      canView: (candidate) => candidate !== restricted,
      resolveSlug: (name) => (name === 'presupuesto' ? restricted._id.toString() : undefined),
    })

    const { items } = await service.listDetailed(user, { includeBody: true })

    expect(items[0].body).toBe('Ver 🔒 *[restricted]*.')
    expect(items[1].body).toBe('También 🔒 *[restricted]*.')
    expect(noteRepository.findByIds).toHaveBeenCalledOnce()
  })

  it('omite el cuerpo y no resuelve enlaces cuando no se pide contenido', async () => {
    const { service, nameIndexService } = build({ notes: [note({ body: 'Ver [[destino]].' })] })

    const { items } = await service.listDetailed(user)

    expect(items[0]).not.toHaveProperty('body')
    expect(nameIndexService.resolveSlug).not.toHaveBeenCalled()
  })

  it('avisa que el mapa está truncado cuando el alcance excede el límite', async () => {
    const { service } = build({ notes: [note({ slug: 'a' }), note({ slug: 'b' })], total: 4200 })

    const result = await service.listDetailed(user, { limit: 2 })

    expect(result).toMatchObject({ total: 4200, limit: 2, truncated: true })
  })

  it('no marca truncado cuando el alcance cabe entero', async () => {
    const { service } = build({ notes: [note({ slug: 'a' }), note({ slug: 'b' })], total: 2 })

    expect(await service.listDetailed(user, { limit: 500 })).toMatchObject({ truncated: false })
  })
})

describe('KnowledgeService archiving', () => {
  it('deja los enlaces entrantes como pendientes sin tocar el texto de origen', async () => {
    const target = note({ slug: 'presupuesto', kind: 'note', version: 3 })
    const source = note({ slug: 'plan', body: 'Depende de [[presupuesto]].' })
    const noteRepository = {
      findById: vi.fn().mockResolvedValue(target),
      findBacklinks: vi.fn().mockResolvedValue([source]),
      unresolveOutlinks: vi.fn().mockResolvedValue({ sourceIds: [source._id.toString()], connections: 2 }),
      softDelete: vi.fn().mockResolvedValue(target),
      update: vi.fn(),
    }
    const nameIndexService = { removeNote: vi.fn(), detachEdgesTo: vi.fn() }
    const service = new KnowledgeService(
      noteRepository as never,
      {} as never,
      {} as never,
      { canManage: () => true, canEdit: () => true } as never,
      {} as never,
      nameIndexService as never,
      {} as never,
      assetServiceStub() as never,
    )

    const result = await service.delete(target._id.toString(), 3, user)

    expect(result).toEqual({ archived: true, pending_connections: 2, updated_notes: 1 })
    expect(noteRepository.unresolveOutlinks).toHaveBeenCalledWith('mente2', target._id.toString())
    expect(noteRepository.update).not.toHaveBeenCalled()
    expect(nameIndexService.detachEdgesTo).toHaveBeenCalledWith([source._id.toString()], target._id.toString())
  })

  it('rechaza el archivado si alguna nota que la referencia está fuera del alcance de escritura', async () => {
    const target = note({ slug: 'presupuesto', version: 1 })
    const source = note({ slug: 'plan', area: 'finance' })
    const noteRepository = {
      findById: vi.fn().mockResolvedValue(target),
      findBacklinks: vi.fn().mockResolvedValue([source]),
      unresolveOutlinks: vi.fn(),
      softDelete: vi.fn(),
    }
    const service = new KnowledgeService(
      noteRepository as never,
      {} as never,
      {} as never,
      { canManage: () => true, canEdit: () => false } as never,
      {} as never,
      {} as never,
      {} as never,
      assetServiceStub() as never,
    )

    await expect(service.delete(target._id.toString(), 1, user)).rejects.toThrow(/finance/)
    expect(noteRepository.softDelete).not.toHaveBeenCalled()
  })
})

describe('KnowledgeService batch creation', () => {
  it('resuelve directamente enlaces mutuos sin depender del orden del chunk', async () => {
    const noteRepository = {
      findAnyBySlugOrAlias: vi.fn().mockResolvedValue(null),
      findByIds: vi.fn().mockResolvedValue([]),
      createMany: vi
        .fn()
        .mockImplementation(async (records) => records.map((record: Partial<NoteDocument>) => note(record))),
      findDanglings: vi.fn().mockResolvedValue([]),
      resolveDangling: vi.fn(),
    }
    const noteVersionRepository = { appendMany: vi.fn().mockResolvedValue(undefined) }
    const areaRepository = {
      findByKey: vi.fn().mockResolvedValue({ key: 'develop', default_sensitivity: Sensitivity.INTERNAL_AREA }),
    }
    const permissionService = { accessTo: vi.fn().mockReturnValue(AreaAccess.WRITE) }
    const nameIndexService = {
      resolveSlug: vi.fn().mockReturnValue(undefined),
      rebuild: vi.fn().mockResolvedValue(undefined),
    }
    const service = new KnowledgeService(
      noteRepository as never,
      noteVersionRepository as never,
      areaRepository as never,
      permissionService as never,
      new ParserService(),
      nameIndexService as never,
      {} as never,
      assetServiceStub() as never,
    )

    const result = await service.createBatch(
      [
        { area: 'develop', title: 'Alpha', body: 'Conecta con [[Beta alias]].' },
        { area: 'develop', title: 'Beta', aliases: ['Beta alias'], body: 'Regresa a [[Alpha]].' },
      ],
      user,
    )

    const records = noteRepository.createMany.mock.calls[0][0] as Array<{
      _id: Types.ObjectId
      slug: string
      outlinks: Array<{ target_id: Types.ObjectId; target_slug: string }>
      unresolved: unknown[]
    }>
    const alpha = records.find((record) => record.slug === 'alpha')
    const beta = records.find((record) => record.slug === 'beta')

    expect(alpha?.outlinks[0]).toMatchObject({ target_id: beta?._id, target_slug: 'beta' })
    expect(alpha?.unresolved).toEqual([])
    expect(beta?.outlinks[0]).toMatchObject({ target_id: alpha?._id, target_slug: 'alpha' })
    expect(result.connections).toEqual({
      resolved: 2,
      within_batch: 2,
      existing: 0,
      unresolved: 0,
      repaired_dangling: 0,
    })
    expect(noteVersionRepository.appendMany).toHaveBeenCalledOnce()
    expect(nameIndexService.rebuild).toHaveBeenCalledOnce()
  })
})
