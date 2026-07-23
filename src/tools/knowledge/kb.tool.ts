import { Injectable } from '@nestjs/common'
import { McpTool, ToolDefinition } from '../tool.interface'
import { UserProfile } from '../user-profile.type'
import { BatchCreateNoteData, KnowledgeService } from '@/modules/knowledge/services/knowledge.service'
import { LinkDirection } from '@/commons/enums'
import { NoteDocument } from '@/repository/schemas/note/note.schema'
import { kbSearchSchema } from './schemas/kb-search.schema'
import { kbGetSchema } from './schemas/kb-get.schema'
import { kbLinksSchema } from './schemas/kb-links.schema'
import { kbListSchema } from './schemas/kb-list.schema'
import { kbCreateSchema } from './schemas/kb-create.schema'
import { kbUpdateSchema } from './schemas/kb-update.schema'
import { kbDeleteSchema } from './schemas/kb-delete.schema'
import { kbCreateBatchSchema } from './schemas/kb-create-batch.schema'

/** Compact confirmation for create/update — avoids echoing the full body back to the caller. */
function toSummary(note: NoteDocument) {
  return {
    id: note._id.toString(),
    slug: note.slug,
    area: note.area,
    kind: note.kind,
    title: note.title,
    version: note.version,
    sensitivity: note.sensitivity,
  }
}

@Injectable()
export class KbTool implements McpTool {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  definitions(user: UserProfile): ToolDefinition[] {
    return [
      {
        name: 'kb_home',
        description:
          "Navigation entry point — call FIRST in a session. Returns your accessible areas with access level (read/write/manage) and the slug of each area's index (Map of Content) and activity log. Read the relevant index with kb_get, then follow [[links]] to drill into notes. Prefer this over blind kb_search.",
        schema: {},
        handler: async () => this.knowledgeService.home(user),
      },
      {
        name: 'kb_search',
        description:
          'Full-text search over notes. Returns ranked candidates without full body. Use as a shortcut when the area index does not cover the topic — prefer navigating from kb_home → index → [[links]] first.',
        schema: kbSearchSchema,
        handler: async ({ query, limit }: { query: string; limit?: number }) =>
          this.knowledgeService.search(query, user, limit),
      },
      {
        name: 'kb_get',
        description:
          'Retrieve a note by slug or alias. Defaults to a compact preview to control token use; pass mode: "full" only when the complete body is needed. Use heading to fetch a single section. Links to notes you cannot read appear as 🔒 [restricted].',
        schema: kbGetSchema,
        handler: async ({
          ref,
          mode,
          heading,
          max_chars,
        }: {
          ref: string
          mode?: 'preview' | 'full'
          heading?: string
          max_chars?: number
        }) => this.knowledgeService.getRedacted(ref, user, { mode, heading, max_chars }),
      },
      {
        name: 'kb_links',
        description: 'Get outgoing and/or incoming [[links]] for a note. Only returns links the caller can see.',
        schema: kbLinksSchema,
        handler: async ({ ref, dir }: { ref: string; dir: LinkDirection }) =>
          this.knowledgeService.links(ref, dir, user),
      },
      {
        name: 'kb_list',
        description: 'List notes metadata (no body). Filtered by caller permissions.',
        schema: kbListSchema,
        handler: async ({ limit }: { limit?: number }) => this.knowledgeService.list(user, limit),
      },
      {
        name: 'kb_create',
        description:
          'Create a new note. Use [[Title]] in body for internal links. Returns a compact confirmation (id, slug, version) — not the full note body.',
        schema: kbCreateSchema,
        handler: async (data: {
          area: string
          title: string
          body: string
          sensitivity?: string
          visible_to?: string[]
        }) => toSummary(await this.knowledgeService.create(data, user)),
      },
      {
        name: 'kb_create_batch',
        description:
          'Create a prevalidated chunk of up to 25 notes. Resolves [[links]] between notes in the same chunk directly, regardless of input order, and also links to existing notes by slug or alias. Returns compact note summaries and connection counts.',
        schema: kbCreateBatchSchema,
        handler: async ({ notes }: { notes: BatchCreateNoteData[] }) => {
          const result = await this.knowledgeService.createBatch(notes, user)
          return {
            created: result.created.map(toSummary),
            connections: result.connections,
          }
        },
      },
      {
        name: 'kb_update',
        description:
          'Update an existing note. Provide base_version for optimistic locking. Returns a compact confirmation (id, slug, version) — not the full note body.',
        schema: kbUpdateSchema,
        handler: async ({
          id,
          base_version,
          ...patch
        }: {
          id: string
          base_version: number
          body?: string
          title?: string
          sensitivity?: string
          visible_to?: string[]
        }) => toSummary(await this.knowledgeService.update(id, patch, base_version, user)),
      },
      {
        name: 'kb_delete',
        description:
          'Soft-delete a note and convert inbound wikilinks to plain text. Requires manage access and base_version for optimistic locking.',
        schema: kbDeleteSchema,
        handler: async ({ id, base_version }: { id: string; base_version: number }) =>
          this.knowledgeService.delete(id, base_version, user),
      },
    ]
  }
}
