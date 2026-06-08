import { Module } from '@nestjs/common'
import { RepositoryModule } from '@/repository/repository.module'
import { OrganizationsService } from './organizations.service'
import { OrganizationsController } from './organizations.controller'

@Module({
  imports: [RepositoryModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
