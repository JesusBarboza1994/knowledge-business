import { Injectable, OnModuleInit, Logger } from '@nestjs/common'
import { Types } from 'mongoose'
import { NoteRepository } from '@/repository/schemas/note/note.repository'

export interface Edge {
  target_id: Types.ObjectId
  target_slug: string
  display: string
  source_heading: string
  source_block: string
  target_anchor: string | null
}

@Injectable()
export class NameIndexService implements OnModuleInit {
  private readonly logger = new Logger(NameIndexService.name)

  private nameIndex = new Map<string, string>()
  private outEdges = new Map<string, Edge[]>()
  private inEdges = new Map<string, Edge[]>()

  constructor(private readonly noteRepository: NoteRepository) {}

  async onModuleInit() {
    await this.rebuild()
  }

  async rebuild() {
    this.nameIndex.clear()
    this.outEdges.clear()
    this.inEdges.clear()

    const notes = await this.noteRepository.findAllActive()

    for (const note of notes) {
      const id = note._id.toString()
      this.nameIndex.set(`${note.tenant}:${note.slug}`, id)
      for (const alias of note.aliases ?? []) {
        this.nameIndex.set(`${note.tenant}:${alias}`, id)
      }

      const edges: Edge[] = (note.outlinks ?? []).map((o) => ({
        target_id: o.target_id,
        target_slug: o.target_slug,
        display: o.display,
        source_heading: o.source_heading,
        source_block: o.source_block,
        target_anchor: o.target_anchor,
      }))
      this.outEdges.set(id, edges)
      this.indexInEdges(id, note.slug, edges)
    }

    this.logger.log(`NameIndex rebuilt: ${this.nameIndex.size} entries, ${this.outEdges.size} nodes`)
  }

  resolveSlug(tenant: string, slugOrAlias: string): string | undefined {
    return this.nameIndex.get(`${tenant}:${slugOrAlias}`)
  }

  getOutEdges(noteId: string): Edge[] {
    return this.outEdges.get(noteId) ?? []
  }

  getInEdges(noteId: string): Edge[] {
    return this.inEdges.get(noteId) ?? []
  }

  private indexInEdges(sourceId: string, sourceSlug: string, edges: Edge[]) {
    for (const edge of edges) {
      const destinationId = edge.target_id.toString()
      const existing = this.inEdges.get(destinationId) ?? []
      this.inEdges.set(destinationId, [
        ...existing,
        { ...edge, target_id: new Types.ObjectId(sourceId), target_slug: sourceSlug },
      ])
    }
  }

  addNote(tenant: string, noteId: string, slug: string, aliases: string[], outlinks: Edge[]) {
    this.nameIndex.set(`${tenant}:${slug}`, noteId)
    for (const alias of aliases) {
      this.nameIndex.set(`${tenant}:${alias}`, noteId)
    }
    this.outEdges.set(noteId, outlinks)
    this.indexInEdges(noteId, slug, outlinks)
  }

  removeNote(tenant: string, noteId: string, slug: string, aliases: string[]) {
    this.nameIndex.delete(`${tenant}:${slug}`)
    for (const alias of aliases) {
      this.nameIndex.delete(`${tenant}:${alias}`)
    }
    const outlinks = this.outEdges.get(noteId) ?? []
    this.outEdges.delete(noteId)
    this.inEdges.delete(noteId)
    for (const edge of outlinks) {
      const destinationId = edge.target_id.toString()
      const existing = this.inEdges.get(destinationId) ?? []
      this.inEdges.set(
        destinationId,
        existing.filter((e) => e.target_id.toString() !== noteId),
      )
    }
  }

  detachEdgesTo(sourceIds: string[], destinationId: string) {
    for (const sourceId of sourceIds) {
      const edges = this.outEdges.get(sourceId)
      if (!edges) continue
      this.outEdges.set(
        sourceId,
        edges.filter((edge) => edge.target_id.toString() !== destinationId),
      )
    }
  }

  updateNote(tenant: string, noteId: string, slug: string, aliases: string[], outlinks: Edge[]) {
    this.removeNote(tenant, noteId, slug, aliases)
    this.addNote(tenant, noteId, slug, aliases, outlinks)
  }
}
