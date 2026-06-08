import { Injectable, UnauthorizedException } from '@nestjs/common'
import { UserRepository } from '@/repository/schemas/user/user.repository'
import { TokenService } from '@/providers/token/token.service'

@Injectable()
export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly tokenService: TokenService,
  ) {}

  async generateToken(email: string): Promise<string> {
    const user = await this.userRepository.findByEmailGlobal(email)
    if (!user) throw new UnauthorizedException('User not found or inactive')

    return this.tokenService.generateToken({
      id: user._id.toString(),
      email: user.email,
      tenant: user.tenant,
      areas: user.areas,
      role: user.role,
    })
  }
}
