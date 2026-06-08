import { Injectable } from '@nestjs/common'
import { McpTool, ToolDefinition } from '../tool.interface'
import { UserProfile } from '../user-profile.type'
import { KnowledgeService } from '@/modules/knowledge/services/knowledge.service'
import { kbSearchSchema } from './schemas/kb-search.schema'
import { kbGetSchema } from './schemas/kb-get.schema'
import { kbLinksSchema } from './schemas/kb-links.schema'
import { kbListSchema } from './schemas/kb-list.schema'
import { kbCreateSchema } from './schemas/kb-create.schema'
import { kbUpdateSchema } from './schemas/kb-update.schema'
import { kbDeleteSchema } from './schemas/kb-delete.schema'

@Injectable()
export class KbTool implements McpTool {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  definitions(user: UserProfile): ToolDefinition[] {
    return [
      {
        name: 'kb_search',
        description: 'Search notes by natural language query. Returns ranked candidates without full body.',
        schema: kbSearchSchema,
        handler: async ({ query, limit }: { query: string; limit?: number }) =>
          this.knowledgeService.search(query, user, limit),
      },
      {
        name: 'kb_get',
        description: 'Retrieve a note by slug or alias. Returns full body and metadata.',
        schema: kbGetSchema,
        handler: async ({ ref }: { ref: string }) => this.knowledgeService.get(ref, user),
      },
      {
        name: 'kb_links',
        description:
          'Get outgoing and/or incoming [[links]] for a note. Only returns links the caller can see.',
        schema: kbLinksSchema,
        handler: async ({ ref, dir }: { ref: string; dir: 'out' | 'in' | 'both' }) =>
          this.knowledgeService.links(ref, dir, user),
      },
      {
        name: 'kb_list',
        description: 'List notes metadata (no body). Filtered by caller permissions.',
        schema: kbListSchema,
        handler: async ({ limit }: { limit?: number }) =>
          this.knowledgeService.list(user, limit),
      },
      {
        name: 'kb_create',
        description: 'Create a new note. Use [[Title]] in body for internal links.',
        schema: kbCreateSchema,
        handler: async (data: {
          area: string
          title: string
          body: string
          sensitivity?: string
          visible_to?: string[]
        }) => this.knowledgeService.create(data, user),
      },
      {
        name: 'kb_update',
        description: 'Update an existing note. Provide base_version for optimistic locking.',
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
        }) => this.knowledgeService.update(id, patch, base_version, user),
      },
      {
        name: 'kb_delete',
        description: 'Soft-delete a note. Provide base_version for optimistic locking.',
        schema: kbDeleteSchema,
        handler: async ({ id, base_version }: { id: string; base_version: number }) =>
          this.knowledgeService.delete(id, base_version, user),
      },
    ]
  }
}
