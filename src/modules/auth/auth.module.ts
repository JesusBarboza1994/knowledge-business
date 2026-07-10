import { Module } from '@nestjs/common'
import { RepositoryModule } from '@/repository/repository.module'
import { TokenModule } from '@/providers/token/token.module'
import { PasswordModule } from '@/providers/password/password.module'
import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'
import { OAuthLoginService } from './oauth-login.service'

@Module({
  imports: [RepositoryModule, TokenModule, PasswordModule],
  controllers: [AuthController],
  providers: [AuthService, OAuthLoginService],
  exports: [AuthService, OAuthLoginService],
})
export class AuthModule {}
