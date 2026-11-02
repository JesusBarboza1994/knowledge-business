import { Body, Controller, Get, HttpCode, Post, Query, Res } from '@nestjs/common'
import { Response } from 'express'
import { AuthService } from './auth.service'
import { AccountService } from './account.service'
import { SessionCookieService } from './session-cookie.service'
import { GenerateTokenDto } from './dto/generate-token.dto'
import { AcceptInvitationDto, EmailOnlyDto, ResetPasswordDto, TokenDto } from './dto/account.dto'
import { Public } from '@/commons/decorators/public.decorator'
import { CurrentUser } from '@/commons/decorators/current-user.decorator'
import { UserProfile } from '@/tools/user-profile.type'
import { TokenService } from '@/providers/token/token.service'
import { UserDocument } from '@/repository/schemas/user/user.schema'

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly accountService: AccountService,
    private readonly tokenService: TokenService,
    private readonly sessionCookie: SessionCookieService,
  ) {}

  /**
   * POST /v1/auth/token
   * Body: { email, password }
   */
  @Post('token')
  @Public()
  async token(@Body() dto: GenerateTokenDto, @Res({ passthrough: true }) response: Response) {
    const access_token = await this.authService.login(dto.email, dto.password)
    this.sessionCookie.set(response, access_token)
    return { access_token }
  }

  @Post('login')
  @Public()
  async login(@Body() dto: GenerateTokenDto, @Res({ passthrough: true }) response: Response) {
    const token = await this.authService.login(dto.email, dto.password)
    this.sessionCookie.set(response, token)
    return this.tokenService.extractFromToken(token)
  }

  @Get('session')
  session(@CurrentUser() user: UserProfile) {
    return user
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response) {
    this.sessionCookie.clear(response)
    return { logged_out: true }
  }

  // ─── Emailed links ───────────────────────────────────────────────────────

  /** Confirms the email and signs the user in, so the sign-up flow lands straight in the app. */
  @Post('verify-email')
  @Public()
  @HttpCode(200)
  async verifyEmail(@Body() dto: TokenDto, @Res({ passthrough: true }) response: Response) {
    return this.startSession(await this.accountService.verifyEmail(dto.token), response)
  }

  /** Always 202: the answer must not reveal whether the email is registered. */
  @Post('resend-verification')
  @Public()
  @HttpCode(202)
  async resendVerification(@Body() dto: EmailOnlyDto) {
    await this.accountService.resendVerification(dto.email)
    return { accepted: true }
  }

  /** Always 202, for the same reason as resend-verification. */
  @Post('forgot-password')
  @Public()
  @HttpCode(202)
  async forgotPassword(@Body() dto: EmailOnlyDto) {
    await this.accountService.forgotPassword(dto.email)
    return { accepted: true }
  }

  @Post('reset-password')
  @Public()
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.accountService.resetPassword(dto.token, dto.password)
    return { reset: true }
  }

  @Get('invitation')
  @Public()
  invitation(@Query() dto: TokenDto) {
    return this.accountService.getInvitation(dto.token)
  }

  @Post('accept-invitation')
  @Public()
  @HttpCode(200)
  async acceptInvitation(@Body() dto: AcceptInvitationDto, @Res({ passthrough: true }) response: Response) {
    const user = await this.accountService.acceptInvitation(dto.token, dto.password, dto.name)
    return this.startSession(user, response)
  }

  private startSession(user: UserDocument, response: Response): UserProfile {
    const token = this.authService.issueToken(user)
    this.sessionCookie.set(response, token)
    return this.tokenService.extractFromToken(token)
  }
}
