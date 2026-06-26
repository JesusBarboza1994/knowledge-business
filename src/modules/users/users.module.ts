import { Module } from '@nestjs/common'
import { RepositoryModule } from '@/repository/repository.module'
import { PasswordModule } from '@/providers/password/password.module'
import { UsersService } from './users.service'
import { UsersController } from './users.controller'

@Module({
  imports: [RepositoryModule, PasswordModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
