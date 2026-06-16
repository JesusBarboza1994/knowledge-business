import { Module } from '@nestjs/common'
import { McpToolsController } from './index'
import { KnowledgeToolModule } from './knowledge/knowledge-tool.module'

@Module({
  imports: [KnowledgeToolModule],
  providers: [McpToolsController],
  exports: [McpToolsController],
})
export class ToolsModule {}
