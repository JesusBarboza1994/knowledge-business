import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { LoggerModule } from './providers/logger/logger.module'
import { SettingsModule } from './settings/settings.module'
import { HealthModule } from '@/modules/health/health.module'
import { MongoModule } from '@/repository/mongo/mongo.module'
import { RepositoryModule } from '@/repository/repository.module'
import { TokenModule } from '@/providers/token/token.module'
import { AuthModule } from '@/modules/auth/auth.module'
import { KnowledgeModule } from '@/modules/knowledge/knowledge.module'
import { OrganizationsModule } from '@/modules/organizations/organizations.module'
import { AreasModule } from '@/modules/areas/areas.module'
import { UsersModule } from '@/modules/users/users.module'
import { ToolsModule } from '@/tools/tools.module'
import { McpModule } from '@/modules/mcp/mcp.module'
import { SessionAuthGuard } from '@/commons/guards/session-auth.guard'

@Module({
  imports: [
    LoggerModule,
    SettingsModule,
    HealthModule,
    MongoModule,
    RepositoryModule,
    TokenModule,
    AuthModule,
    KnowledgeModule,
    OrganizationsModule,
    AreasModule,
    UsersModule,
    ToolsModule,
    McpModule,
  ],
  controllers: [],
  providers: [{ provide: APP_GUARD, useClass: SessionAuthGuard }],
})
export class AppModule {}
