import { Injectable, UnauthorizedException } from '@nestjs/common'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import { UserProfile } from '@/tools/user-profile.type'

interface TokenPayload extends UserProfile {
  iat: number
  exp: number
}

@Injectable()
export class TokenService {
  private readonly secret: string
  private readonly ttlSeconds: number

  constructor(private readonly configService: ConfigService) {
    const configuredSecret = this.configService.get<string>('auth.secret')
    if (!configuredSecret && process.env.NODE_ENV === 'production') {
      throw new Error('AUTH_TOKEN_SECRET is required in production')
    }
    this.secret = configuredSecret ?? 'changeme-development-only'
    this.ttlSeconds = this.configService.get<number>('auth.tokenTtl') ?? 86400 * 30
  }

  generateToken(user: UserProfile): string {
    const now = Math.floor(Date.now() / 1000)
    const payload: TokenPayload = { ...user, iat: now, exp: now + this.ttlSeconds }
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const sig = this.sign(encoded)
    return `${encoded}.${sig}`
  }

  extractFromToken(token: string): UserProfile {
    const payload = this.extractPayload(token)
    return {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      tenant: payload.tenant,
      memberships: payload.memberships ?? [],
      role: payload.role,
    }
  }

  extractFromTokenWithExpiration(token: string): { user: UserProfile; expiresAt: number } {
    const payload = this.extractPayload(token)
    return {
      user: {
        id: payload.id,
        email: payload.email,
        name: payload.name,
        tenant: payload.tenant,
        memberships: payload.memberships ?? [],
        role: payload.role,
      },
      expiresAt: payload.exp,
    }
  }

  private extractPayload(token: string): TokenPayload {
    const dotIndex = token.lastIndexOf('.')
    if (dotIndex === -1) throw new UnauthorizedException('Malformed token')

    const encoded = token.slice(0, dotIndex)
    const sig = token.slice(dotIndex + 1)

    const expected = this.sign(encoded)
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      throw new UnauthorizedException('Invalid token signature')
    }

    let payload: TokenPayload
    try {
      payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
    } catch {
      throw new UnauthorizedException('Malformed token payload')
    }

    if (payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Token expired')
    }

    return payload
  }

  private sign(encoded: string): string {
    return createHmac('sha256', this.secret).update(encoded).digest('base64url')
  }
}
