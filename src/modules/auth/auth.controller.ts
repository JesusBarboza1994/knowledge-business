import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AuthService } from './auth.service'
import { GenerateTokenDto } from './dto/generate-token.dto'

@Controller('auth')
export class AuthController {
  private readonly adminApiKey: string

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    this.adminApiKey = this.configService.get<string>('auth.adminApiKey') ?? ''
  }

  /**
   * POST /v1/auth/token
   * Header: x-api-key: <AUTH_ADMIN_API_KEY>
   * Body:   { email }
   */
  @Post('token')
  async generateToken(
    @Body() dto: GenerateTokenDto,
    @Headers('x-api-key') apiKey: string,
  ) {
    if (!this.adminApiKey || apiKey !== this.adminApiKey) {
      throw new UnauthorizedException('Invalid admin API key')
    }

    const access_token = await this.authService.generateToken(dto.email)
    return { access_token }
  }
}
