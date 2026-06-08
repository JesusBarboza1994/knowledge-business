import { Module } from '@nestjs/common'
import { McpToolsController } from './index'
import { ExampleModule } from './example/example.module'
import { KnowledgeToolModule } from './knowledge/knowledge-tool.module'

@Module({
  imports: [ExampleModule, KnowledgeToolModule],
  providers: [McpToolsController],
  exports: [McpToolsController],
})
export class ToolsModule {}
