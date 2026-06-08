import { Module } from '@nestjs/common'
import { RepositoryModule } from '@/repository/repository.module'
import { AreasService } from './areas.service'
import { AreasController } from './areas.controller'

@Module({
  imports: [RepositoryModule],
  controllers: [AreasController],
  providers: [AreasService],
  exports: [AreasService],
})
export class AreasModule {}
