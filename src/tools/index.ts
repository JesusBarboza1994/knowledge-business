import { Injectable } from '@nestjs/common'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { withToolInterceptor } from '../commons/decorators/tool-response.interceptor'
import { McpTool } from './tool.interface'
import { UserProfile } from './user-profile.type'
import { ExampleTool } from './example/example.tool'
import { KbTool } from './knowledge/kb.tool'

@Injectable()
export class McpToolsController {
  private readonly mcpTools: McpTool[]

  constructor(exampleTool: ExampleTool, kbTool: KbTool) {
    this.mcpTools = [exampleTool, kbTool]
  }

  register(server: McpServer, user: UserProfile) {
    for (const tool of this.mcpTools) {
      for (const { name, description, schema, handler } of tool.definitions(user)) {
        server.tool(name, description, schema, withToolInterceptor(name, handler))
      }
    }
  }
}
