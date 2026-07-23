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

function serviceWith(source: NoteDocument, target: NoteDocument, canViewTarget: boolean) {
  const noteRepository = {
    listDetailed: vi.fn().mockResolvedValue([source]),
    findByIds: vi.fn().mockResolvedValue([target]),
  }
  const permissionService = {
    canView: vi.fn((_user: UserProfile, candidate: NoteDocument) => candidate === source || canViewTarget),
  }
  const service = new KnowledgeService(
    noteRepository as never,
    {} as never,
    {} as never,
    permissionService as never,
    {} as never,
    {} as never,
    {} as never,
  )
  return service
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

    const [result] = await serviceWith(source, target, true).listDetailed(user)

    expect(result.outlinks).toEqual([
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

    const [result] = await serviceWith(source, target, false).listDetailed(user)

    expect(result.outlinks).toEqual([
      {
        display: 'Presupuesto confidencial',
        target_id: null,
        target_slug: null,
        access: 'restricted',
      },
    ])
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
