import { Module } from '@nestjs/common'
import { RepositoryModule } from '@/repository/repository.module'
import { TokenModule } from '@/providers/token/token.module'
import { PasswordModule } from '@/providers/password/password.module'
import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'

@Module({
  imports: [RepositoryModule, TokenModule, PasswordModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
