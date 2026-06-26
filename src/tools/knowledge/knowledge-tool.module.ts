import { Module } from '@nestjs/common'
import { KbTool } from './kb.tool'
import { KbGuideTool } from './kb-guide.tool'
import { KbPrompt } from './kb.prompt'
import { KbResource } from './kb.resource'
import { KnowledgeModule } from '@/modules/knowledge/knowledge.module'

@Module({
  imports: [KnowledgeModule],
  providers: [KbTool, KbGuideTool, KbPrompt, KbResource],
  exports: [KbTool, KbGuideTool, KbPrompt, KbResource],
})
export class KnowledgeToolModule {}
