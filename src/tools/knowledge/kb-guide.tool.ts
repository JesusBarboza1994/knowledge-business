import { Injectable } from '@nestjs/common'
import { McpTool, ToolDefinition } from '../tool.interface'
import { UserProfile } from '../user-profile.type'
import { KnowledgeService } from '@/modules/knowledge/services/knowledge.service'
import { kbQueryGuideSchema } from './schemas/kb-query-guide.schema'
import { INGEST_GUIDE, QUERY_GUIDE, LINT_GUIDE } from './kb-guide.texts'

/**
 * Tool-based mirrors of MCP Prompts and Resources.
 *
 * Claude Desktop + mcp-remote only surfaces tools to the model.
 * These tools expose the same content that kb.prompt.ts and kb.resource.ts
 * register as MCP prompts/resources, so the model can access them today.
 *
 * Guide texts live in kb-guide.texts.ts (shared with kb.prompt.ts).
 */
@Injectable()
export class KbGuideTool implements McpTool {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  definitions(user: UserProfile): ToolDefinition[] {
    return [
      {
        name: 'kb_ingest_guide',
        description:
          'Call BEFORE ingesting a document. Returns the workflow and rules for decomposing documents into structured wiki notes, updating the area index, and logging the ingestion. No arguments needed.',
        schema: {},
        handler: async () => ({
          guide: INGEST_GUIDE,
        }),
      },
      {
        name: 'kb_query_guide',
        description:
          'Call BEFORE answering a user question from the wiki. Returns the index-first search strategy and answer rules tailored to the question.',
        schema: kbQueryGuideSchema,
        handler: async ({ question }: { question: string }) => ({
          guide: QUERY_GUIDE.replace('${question}', question),
        }),
      },
      {
        name: 'kb_lint_guide',
        description:
          'Call to run a health check on the wiki. Returns the checklist for finding unmapped notes, orphans, broken links, missing provenance, contradictions, and sensitivity leaks.',
        schema: {},
        handler: async () => ({
          guide: LINT_GUIDE,
        }),
      },
      {
        name: 'kb_whoami',
        description:
          'Call FIRST, before creating or updating any note. Returns your identity, the areas you can access (each with can_read / can_write / can_manage flags), a writable_areas shortcut list, and note counts per area. For navigation entry points (area indexes), use kb_home.',
        schema: {},
        handler: async () => this.knowledgeService.getMyContext(user),
      },
    ]
  }
}
