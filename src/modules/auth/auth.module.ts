import { Module } from '@nestjs/common'
import { RepositoryModule } from '@/repository/repository.module'
import { TokenModule } from '@/providers/token/token.module'
import { PasswordModule } from '@/providers/password/password.module'
import { MailModule } from '@/providers/mail/mail.module'
import { AuthTokenModule } from '@/providers/auth-token/auth-token.module'
import { AuthService } from './auth.service'
import { AccountService } from './account.service'
import { SessionCookieService } from './session-cookie.service'
import { AuthController } from './auth.controller'
import { SignupController } from './signup.controller'
import { OAuthLoginService } from './oauth-login.service'

@Module({
  imports: [RepositoryModule, TokenModule, PasswordModule, MailModule, AuthTokenModule],
  controllers: [AuthController, SignupController],
  providers: [AuthService, AccountService, SessionCookieService, OAuthLoginService],
  exports: [AuthService, AccountService, OAuthLoginService],
})
export class AuthModule {}
