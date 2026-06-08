import { Injectable } from '@nestjs/common'
import { McpTool, ToolDefinition } from '../tool.interface'
import { UserProfile } from '../user-profile.type'
import { pingSchema } from './schemas/ping.schema'

/**
 * ExampleTool — template for implementing MCP tools.
 *
 * Pattern to follow when adding KB tools (kb.search, kb.get, etc.):
 *  1. Create a Zod schema file under `schemas/`
 *  2. Inject the service with the business logic in the constructor
 *  3. Add a ToolDefinition in `definitions()` — close over `user` to pass it to handlers
 *  4. Register the module in ToolsModule
 */
@Injectable()
export class ExampleTool implements McpTool {
  // Inject your service here, e.g.:
  // constructor(private readonly knowledgeService: KnowledgeService) {}

  definitions(user: UserProfile): ToolDefinition[] {
    return [
      {
        name: 'example_ping',
        description: 'Returns a pong response. Use this as a template for new tools.',
        schema: pingSchema,
        handler: async ({ message }: { message?: string }) => ({
          pong: true,
          echo: message ?? null,
          // user is available here via closure — use it to scope queries
          caller: user.email,
          tenant: user.tenant,
          timestamp: new Date().toISOString(),
        }),
      },
    ]
  }
}
