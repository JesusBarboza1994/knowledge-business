import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Response } from 'express'
import { SESSION_COOKIE } from '@/commons/guards/session-auth.guard'

/** The web session cookie, shared by login and by the emailed links that sign the user in. */
@Injectable()
export class SessionCookieService {
  constructor(private readonly configService: ConfigService) {}

  set(response: Response, token: string): void {
    const ttlSeconds = this.configService.get<number>('auth.tokenTtl') ?? 86400 * 30
    response.cookie(SESSION_COOKIE, token, { ...this.options(), maxAge: ttlSeconds * 1000 })
  }

  clear(response: Response): void {
    response.clearCookie(SESSION_COOKIE, this.options())
  }

  private options() {
    const sameSite = this.configService.get<'lax' | 'strict' | 'none'>('http.cookieSameSite') ?? 'lax'
    return {
      httpOnly: true,
      secure: this.configService.get<boolean>('http.cookieSecure') ?? false,
      sameSite,
      path: '/',
    } as const
  }
}
