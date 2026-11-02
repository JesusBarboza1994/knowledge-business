import { ForbiddenException, Injectable } from '@nestjs/common'
import { UserRepository } from '@/repository/schemas/user/user.repository'
import { UserDocument, isEmailVerified } from '@/repository/schemas/user/user.schema'
import { TokenService } from '@/providers/token/token.service'
import { PasswordService } from '@/providers/password/password.service'
import { UnauthorizedException } from '@/commons/exceptions/auth/unauthorized.exception'
import { AreaAccess, UserRole } from '@/commons/enums'
import { ErrorCode, errorBody } from '@/commons/constants/error-code.constant'

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

    // Checked after the password so an unverified state is only revealed to the account owner.
    if (!isEmailVerified(user)) {
      throw new ForbiddenException(errorBody(ErrorCode.EMAIL_NOT_VERIFIED, 'Confirm your email before signing in'))
    }

    return this.issueToken(user)
  }

  /** Session token for a user whose identity was already proven (password, or an emailed link). */
  issueToken(user: UserDocument): string {
    return this.tokenService.generateToken({
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      tenant: user.tenant,
      memberships: (user.memberships ?? []).map((m) => ({ area: m.area, access: m.access as AreaAccess })),
      role: user.role as UserRole,
    })
  }
}
