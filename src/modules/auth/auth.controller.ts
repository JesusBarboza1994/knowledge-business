import { Body, Controller, Post } from '@nestjs/common'
import { AuthService } from './auth.service'
import { GenerateTokenDto } from './dto/generate-token.dto'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /v1/auth/token
   * Body: { email, password }
   */
  @Post('token')
  async login(@Body() dto: GenerateTokenDto) {
    const access_token = await this.authService.login(dto.email, dto.password)
    return { access_token }
  }
}
