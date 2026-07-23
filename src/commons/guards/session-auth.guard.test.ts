import { ConfigService } from '@nestjs/config'
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { describe, expect, it, vi } from 'vitest'
import { TokenService } from '@/providers/token/token.service'
import { SessionAuthGuard } from './session-auth.guard'
import { UserRepository } from '@/repository/schemas/user/user.repository'

function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext
}

function createGuard(isPublic = false) {
  const profile = { id: 'u1', email: 'user@example.com', tenant: 'tenant', memberships: [], role: 'member' }
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(isPublic) } as unknown as Reflector
  const tokenService = { extractFromToken: vi.fn().mockReturnValue(profile) } as unknown as TokenService
  const config = { get: vi.fn().mockReturnValue('https://app.example.com') } as unknown as ConfigService
  const currentUser = {
    _id: { toString: () => 'u1' },
    email: profile.email,
    tenant: profile.tenant,
    role: profile.role,
    status: 'active',
    memberships: [],
  }
  const users = { findByEmailAnyStatus: vi.fn().mockResolvedValue(currentUser) } as unknown as UserRepository
  return { guard: new SessionAuthGuard(reflector, tokenService, config, users), profile }
}

describe('SessionAuthGuard', () => {
  it('permite rutas públicas sin token', async () => {
    const { guard } = createGuard(true)
    await expect(guard.canActivate(contextFor({ method: 'GET', headers: {} }))).resolves.toBe(true)
  })

  it('rechaza una ruta privada sin sesión', async () => {
    const { guard } = createGuard()
    await expect(guard.canActivate(contextFor({ method: 'GET', headers: {} }))).rejects.toThrow(UnauthorizedException)
  })

  it('extrae el usuario desde la cookie firmada', async () => {
    const { guard, profile } = createGuard()
    const request = { method: 'GET', headers: { cookie: 'knowledge_session=signed-token' } }
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true)
    expect(request).toMatchObject({ user: profile, authSource: 'cookie' })
  })

  it('rechaza mutaciones cookie desde un origen no permitido', async () => {
    const { guard } = createGuard()
    const request = {
      method: 'POST',
      headers: { cookie: 'knowledge_session=signed-token', origin: 'https://evil.example' },
    }
    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(ForbiddenException)
  })
})
