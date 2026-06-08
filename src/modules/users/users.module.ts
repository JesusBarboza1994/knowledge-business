import { Module } from '@nestjs/common'
import { RepositoryModule } from '@/repository/repository.module'
import { UsersService } from './users.service'
import { UsersController } from './users.controller'

@Module({
  imports: [RepositoryModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
