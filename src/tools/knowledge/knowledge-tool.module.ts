import { Module } from '@nestjs/common'
import { KbTool } from './kb.tool'
import { KnowledgeModule } from '@/modules/knowledge/knowledge.module'

@Module({
  imports: [KnowledgeModule],
  providers: [KbTool],
  exports: [KbTool],
})
export class KnowledgeToolModule {}
