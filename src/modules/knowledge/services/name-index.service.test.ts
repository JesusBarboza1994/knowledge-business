import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'
import { NoteDocument } from '@/repository/schemas/note/note.schema'
import { Edge, NameIndexService } from './name-index.service'

const alpha = new Types.ObjectId()
const beta = new Types.ObjectId()

function edgeTo(target: Types.ObjectId, targetSlug: string): Edge {
  return {
    target_id: target,
    target_slug: targetSlug,
    display: targetSlug,
    source_heading: '',
    source_block: 'b_00',
    target_anchor: null,
  }
}

function stored(id: Types.ObjectId, slug: string, outlinks: Edge[]) {
  return { _id: id, tenant: 'mente2', slug, aliases: [], outlinks } as unknown as NoteDocument
}

describe('NameIndexService inbound edges', () => {
  let service: NameIndexService
  let noteRepository: { findAllActive: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    noteRepository = { findAllActive: vi.fn().mockResolvedValue([]) }
    service = new NameIndexService(noteRepository as never)
  })

  it('apunta al origen tanto si la arista viene del arranque como de una nota nueva', async () => {
    noteRepository.findAllActive.mockResolvedValue([
      stored(alpha, 'alpha', [edgeTo(beta, 'beta')]),
      stored(beta, 'beta', []),
    ])
    await service.rebuild()
    const [fromRebuild] = service.getInEdges(beta.toString())

    service.addNote('mente2', alpha.toString(), 'alpha', [], [edgeTo(beta, 'beta')])
    const fromAddNote = service.getInEdges(beta.toString()).at(-1)

    expect(fromRebuild.target_id.toString()).toBe(alpha.toString())
    expect(fromRebuild.target_slug).toBe('alpha')
    // Ambos caminos deben describir el backlink igual, o removeNote no puede limpiarlo.
    expect(fromAddNote?.target_id.toString()).toBe(alpha.toString())
    expect(fromAddNote?.target_slug).toBe('alpha')
  })

  it('elimina los backlinks de una nota añadida en caliente', () => {
    service.addNote('mente2', alpha.toString(), 'alpha', [], [edgeTo(beta, 'beta')])
    expect(service.getInEdges(beta.toString())).toHaveLength(1)

    service.removeNote('mente2', alpha.toString(), 'alpha', [])

    expect(service.getInEdges(beta.toString())).toEqual([])
    expect(service.resolveSlug('mente2', 'alpha')).toBeUndefined()
  })
})
