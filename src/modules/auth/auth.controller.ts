import { Body, Controller, Get, Post, Res } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Response } from 'express'
import { AuthService } from './auth.service'
import { GenerateTokenDto } from './dto/generate-token.dto'
import { Public } from '@/commons/decorators/public.decorator'
import { CurrentUser } from '@/commons/decorators/current-user.decorator'
import { SESSION_COOKIE } from '@/commons/guards/session-auth.guard'
import { UserProfile } from '@/tools/user-profile.type'
import { TokenService } from '@/providers/token/token.service'

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * POST /v1/auth/token
   * Body: { email, password }
   */
  @Post('token')
  @Public()
  async token(@Body() dto: GenerateTokenDto, @Res({ passthrough: true }) response: Response) {
    const access_token = await this.authService.login(dto.email, dto.password)
    this.setSessionCookie(response, access_token)
    return { access_token }
  }

  @Post('login')
  @Public()
  async login(@Body() dto: GenerateTokenDto, @Res({ passthrough: true }) response: Response) {
    const token = await this.authService.login(dto.email, dto.password)
    this.setSessionCookie(response, token)
    return this.tokenService.extractFromToken(token)
  }

  @Get('session')
  session(@CurrentUser() user: UserProfile) {
    return user
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie(SESSION_COOKIE, this.cookieOptions())
    return { logged_out: true }
  }

  private setSessionCookie(response: Response, token: string): void {
    const ttlSeconds = this.configService.get<number>('auth.tokenTtl') ?? 86400 * 30
    response.cookie(SESSION_COOKIE, token, { ...this.cookieOptions(), maxAge: ttlSeconds * 1000 })
  }

  private cookieOptions() {
    const sameSite = this.configService.get<'lax' | 'strict' | 'none'>('http.cookieSameSite') ?? 'lax'
    return {
      httpOnly: true,
      secure: this.configService.get<boolean>('http.cookieSecure') ?? false,
      sameSite,
      path: '/',
    } as const
  }
}
