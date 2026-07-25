import { Module } from '@nestjs/common'
import { RepositoryModule } from '@/repository/repository.module'
import { S3Module } from '@/providers/s3/s3.module'
import { PermissionService } from './services/permission.service'
import { ParserService } from './services/parser.service'
import { NameIndexService } from './services/name-index.service'
import { KnowledgeService } from './services/knowledge.service'
import { AssetService } from './services/asset.service'
import { KnowledgeController } from './knowledge.controller'
import { AssetsController } from './assets.controller'

@Module({
  imports: [RepositoryModule, S3Module],
  controllers: [KnowledgeController, AssetsController],
  providers: [PermissionService, ParserService, NameIndexService, KnowledgeService, AssetService],
  exports: [KnowledgeService, AssetService],
})
export class KnowledgeModule {}
