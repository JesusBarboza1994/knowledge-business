import { Injectable } from '@nestjs/common'
import { z } from 'zod'
import { McpPrompt, PromptDefinition } from '../prompt.interface'
import { UserProfile } from '../user-profile.type'
import { INGEST_GUIDE, QUERY_GUIDE, LINT_GUIDE } from './kb-guide.texts'

@Injectable()
export class KbPrompt implements McpPrompt {
  definitions(_user: UserProfile): PromptDefinition[] {
    return [
      {
        name: 'kb_ingest',
        description:
          'Instructions for ingesting a document into the Knowledge Hub — decompose, integrate with existing knowledge, cross-reference, update the area index, and log the ingestion.',
        handler: async () => ({
          messages: [
            {
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text: INGEST_GUIDE,
              },
            },
          ],
        }),
      },
      {
        name: 'kb_query',
        description: 'Index-first strategy for answering a question from the compiled Knowledge Hub wiki.',
        argsSchema: { question: z.string().describe('The question to answer') },
        handler: async ({ question }) => ({
          messages: [
            {
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text: QUERY_GUIDE.replace('${question}', question),
              },
            },
          ],
        }),
      },
      {
        name: 'kb_lint',
        description:
          'Health check for the Knowledge Hub wiki — find unmapped notes, orphans, broken links, missing provenance, contradictions, and sensitivity leaks.',
        handler: async () => ({
          messages: [
            {
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text: LINT_GUIDE,
              },
            },
          ],
        }),
      },
    ]
  }
}
