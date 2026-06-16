import { Injectable, UnauthorizedException } from '@nestjs/common'
import { UserRepository } from '@/repository/schemas/user/user.repository'
import { TokenService } from '@/providers/token/token.service'
import { PasswordService } from '@/providers/password/password.service'

@Injectable()
export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly tokenService: TokenService,
    private readonly passwordService: PasswordService,
  ) {}

  async login(email: string, password: string): Promise<string> {
    const user = await this.userRepository.findByEmailWithPassword(email)

    if (!user) throw new UnauthorizedException('Invalid credentials')
    if (!user.password_hash) throw new UnauthorizedException('Password not set — contact your administrator')

    const valid = await this.passwordService.verify(password, user.password_hash)
    if (!valid) throw new UnauthorizedException('Invalid credentials')

    return this.tokenService.generateToken({
      id: user._id.toString(),
      email: user.email,
      tenant: user.tenant,
      areas: user.areas,
      role: user.role,
    })
  }
}
