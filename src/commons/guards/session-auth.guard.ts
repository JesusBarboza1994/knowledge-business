import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { TokenService } from '@/providers/token/token.service'
import { UserProfile } from '@/tools/user-profile.type'
import { IS_PUBLIC_ROUTE } from '@/commons/decorators/public.decorator'
import { UserRepository } from '@/repository/schemas/user/user.repository'
import { AreaAccess, UserRole, UserStatus } from '@/commons/enums'

export const SESSION_COOKIE = 'knowledge_session'

type AuthenticatedRequest = {
  method: string
  headers: Record<string, string | string[] | undefined>
  user?: UserProfile
  authSource?: 'bearer' | 'cookie'
}

function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined
  for (const pair of header.split(';')) {
    const [key, ...value] = pair.trim().split('=')
    if (key === name) return decodeURIComponent(value.join('='))
  }
  return undefined
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService,
    private readonly userRepository: UserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const authorization = request.headers.authorization
    const bearer =
      typeof authorization === 'string' && authorization.startsWith('Bearer ')
        ? authorization.slice(7).trim()
        : undefined
    const cookieHeader = typeof request.headers.cookie === 'string' ? request.headers.cookie : undefined
    const cookie = parseCookie(cookieHeader, SESSION_COOKIE)
    const token = bearer ?? cookie
    if (!token) throw new UnauthorizedException('Authentication required')

    try {
      const claimed = this.tokenService.extractFromToken(token)
      const current = await this.userRepository.findByEmailAnyStatus(claimed.tenant, claimed.email)
      if (!current || current.status !== UserStatus.ACTIVE || current._id.toString() !== claimed.id) {
        throw new UnauthorizedException('User is no longer active')
      }
      request.user = {
        id: current._id.toString(),
        email: current.email,
        name: current.name,
        tenant: current.tenant,
        role: current.role as UserRole,
        memberships: (current.memberships ?? []).map((membership) => ({
          area: membership.area,
          access: membership.access as AreaAccess,
        })),
      }
      request.authSource = bearer ? 'bearer' : 'cookie'
    } catch {
      throw new UnauthorizedException('Session expired or invalid')
    }

    if (request.authSource === 'cookie' && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      this.assertTrustedOrigin(request.headers.origin)
    }
    return true
  }

  private assertTrustedOrigin(originHeader: string | string[] | undefined): void {
    if (!originHeader) return
    const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader
    const allowed =
      this.configService
        .get<string>('http.allowedOrigins')
        ?.split(',')
        .map((value) => value.trim())
        .filter(Boolean) ?? []
    if (allowed.length > 0 && !allowed.includes(origin)) {
      throw new ForbiddenException('Origin is not allowed')
    }
  }
}
