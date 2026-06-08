import { Module } from '@nestjs/common'
import { RepositoryModule } from '@/repository/repository.module'
import { PermissionService } from './services/permission.service'
import { ParserService } from './services/parser.service'
import { NameIndexService } from './services/name-index.service'
import { KnowledgeService } from './services/knowledge.service'

@Module({
  imports: [RepositoryModule],
  providers: [PermissionService, ParserService, NameIndexService, KnowledgeService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
