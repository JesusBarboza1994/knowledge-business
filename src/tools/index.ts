import { Injectable } from '@nestjs/common'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { withToolInterceptor } from '../commons/decorators/tool-response.interceptor'
import { McpTool } from './tool.interface'
import { McpPrompt } from './prompt.interface'
import { McpResource } from './resource.interface'
import { UserProfile } from './user-profile.type'
import { KbTool } from './knowledge/kb.tool'
import { KbGuideTool } from './knowledge/kb-guide.tool'
import { KbPrompt } from './knowledge/kb.prompt'
import { KbResource } from './knowledge/kb.resource'

@Injectable()
export class McpToolsController {
  private readonly tools: McpTool[]
  private readonly prompts: McpPrompt[]
  private readonly resources: McpResource[]

  constructor(kbTool: KbTool, kbGuideTool: KbGuideTool, kbPrompt: KbPrompt, kbResource: KbResource) {
    this.tools = [kbTool, kbGuideTool]
    this.prompts = [kbPrompt]
    this.resources = [kbResource]
  }

  register(server: McpServer, user: UserProfile) {
    for (const tool of this.tools) {
      for (const { name, description, schema, handler } of tool.definitions(user)) {
        server.tool(
          name,
          description,
          schema,
          withToolInterceptor(name, (args) => {
            console.log(`[MCP][Tool] ${name} | user: ${user.email} | tenant: ${user.tenant}`)
            return handler(args)
          }),
        )
      }
    }

    for (const prompt of this.prompts) {
      for (const { name, description, argsSchema, handler } of prompt.definitions(user)) {
        const wrappedHandler = (args: Record<string, string>) => {
          console.log(
            `[MCP][Prompt] ${name} | user: ${user.email} | tenant: ${user.tenant} | args: ${JSON.stringify(args)}`,
          )
          return handler(args)
        }
        if (argsSchema) {
          server.prompt(name, description, argsSchema, (args) => wrappedHandler(args as Record<string, string>))
        } else {
          server.prompt(name, description, () => wrappedHandler({}))
        }
      }
    }

    for (const resource of this.resources) {
      for (const { name, uri, description, mimeType, handler } of resource.definitions(user)) {
        server.resource(name, uri, { description, mimeType }, (resourceUri) => {
          console.log(`[MCP][Resource] ${name} (${uri}) | user: ${user.email} | tenant: ${user.tenant}`)
          return handler(resourceUri)
        })
      }
    }
  }
}
