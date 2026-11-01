import { describe, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'
import { ConfigService } from '@nestjs/config'
import { AccountService } from './account.service'
import { AuthTokenPurpose, OrganizationPlan, UserRole, UserStatus } from '@/commons/enums'

const signup = {
  organization_name: 'Resortes Acme',
  slug: 'resortes-acme',
  description: 'Fabricación de resortes helicoidales en acero',
  phone_country_code: '+51',
  phone_number: '987 654 321',
  name: 'Ana Pérez',
  email: 'ana@acme.com',
  password: 'contraseña-segura',
}

function userDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    tenant: 'resortes-acme',
    email: 'ana@acme.com',
    name: 'Ana Pérez',
    status: UserStatus.ACTIVE,
    email_verified_at: null,
    ...overrides,
  }
}

function build(
  options: { slugTaken?: boolean; emailTaken?: boolean; userCreateError?: unknown; mailFails?: boolean } = {},
) {
  const orgId = new Types.ObjectId()
  const organizationRepository = {
    existsBySlug: vi.fn().mockResolvedValue(options.slugTaken ?? false),
    create: vi.fn().mockImplementation(async (data) => ({ _id: orgId, ...data })),
    deleteById: vi.fn().mockResolvedValue(undefined),
    findBySlug: vi.fn().mockResolvedValue({ name: 'Resortes Acme' }),
  }
  const userRepository = {
    existsByEmail: vi.fn().mockResolvedValue(options.emailTaken ?? false),
    create: options.userCreateError
      ? vi.fn().mockRejectedValue(options.userCreateError)
      : vi.fn().mockImplementation(async (data) => userDoc(data)),
    findByEmailGlobal: vi.fn(),
    findByIdGlobal: vi.fn(),
    updateByIdGlobal: vi.fn().mockImplementation(async (_id, data) => userDoc({ ...data })),
  }
  const passwordService = { hash: vi.fn().mockResolvedValue('hashed') }
  const authTokenService = {
    issue: vi.fn().mockResolvedValue('raw-token'),
    consume: vi.fn(),
    peek: vi.fn(),
    inCooldown: vi.fn().mockResolvedValue(false),
  }
  const mailService = {
    send: options.mailFails ? vi.fn().mockRejectedValue(new Error('403')) : vi.fn().mockResolvedValue(undefined),
  }
  const config = { get: vi.fn().mockReturnValue({ frontendUrl: 'https://app.example.com' }) }
  const service = new AccountService(
    userRepository as never,
    organizationRepository as never,
    passwordService as never,
    authTokenService as never,
    mailService as never,
    config as unknown as ConfigService,
  )
  return { service, organizationRepository, userRepository, authTokenService, mailService, orgId }
}

describe('AccountService.signup', () => {
  it('crea la organización en plan free y a su admin sin verificar, y envía el correo', async () => {
    const { service, organizationRepository, userRepository, mailService } = build()

    const result = await service.signup(signup)

    expect(organizationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'resortes-acme', plan: OrganizationPlan.FREE, phone_country_code: '+51' }),
    )
    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: UserRole.ADMIN, status: UserStatus.ACTIVE, email_verified_at: null }),
    )
    const sent = mailService.send.mock.calls[0][0]
    expect(sent.to).toBe('ana@acme.com')
    expect(sent.text).toContain('https://app.example.com/verificar-email?token=raw-token')
    expect(result).toEqual({ email: 'ana@acme.com', organization: 'resortes-acme', verification_sent: true })
  })

  it('rechaza un slug ocupado o reservado', async () => {
    await expect(build({ slugTaken: true }).service.signup(signup)).rejects.toMatchObject({
      response: { code: 'SLUG_TAKEN' },
    })
    await expect(build().service.signup({ ...signup, slug: 'admin' })).rejects.toMatchObject({
      response: { code: 'SLUG_TAKEN' },
    })
  })

  it('rechaza un email que ya pertenece a una organización sin crear nada', async () => {
    const { service, organizationRepository } = build({ emailTaken: true })

    await expect(service.signup(signup)).rejects.toMatchObject({ response: { code: 'EMAIL_TAKEN' } })
    expect(organizationRepository.create).not.toHaveBeenCalled()
  })

  it('borra la organización si el admin no se pudo crear', async () => {
    const { service, organizationRepository, orgId } = build({
      userCreateError: Object.assign(new Error('dup'), { code: 11000 }),
    })

    await expect(service.signup(signup)).rejects.toMatchObject({ response: { code: 'EMAIL_TAKEN' } })
    expect(organizationRepository.deleteById).toHaveBeenCalledWith(orgId.toString())
  })

  it('mantiene la cuenta creada si el correo falla y lo informa para ofrecer reenviar', async () => {
    const { service } = build({ mailFails: true })

    await expect(service.signup(signup)).resolves.toMatchObject({ verification_sent: false })
  })
})

describe('AccountService.checkSlug', () => {
  it('distingue inválido, reservado, ocupado y libre', async () => {
    const { service } = build()
    await expect(service.checkSlug('Con Espacios')).resolves.toMatchObject({ available: false, reason: 'invalid' })
    await expect(service.checkSlug('api')).resolves.toMatchObject({ available: false, reason: 'reserved' })
    await expect(build({ slugTaken: true }).service.checkSlug('acme')).resolves.toMatchObject({ reason: 'taken' })
    await expect(service.checkSlug('acme')).resolves.toMatchObject({ available: true })
  })
})

describe('AccountService enlaces por correo', () => {
  it('verifica el email con un token válido', async () => {
    const { service, authTokenService, userRepository } = build()
    authTokenService.consume.mockResolvedValue({ user_id: new Types.ObjectId() })

    await service.verifyEmail('raw-token')

    expect(authTokenService.consume).toHaveBeenCalledWith('raw-token', AuthTokenPurpose.VERIFY_EMAIL)
    expect(userRepository.updateByIdGlobal).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ email_verified_at: expect.any(Date) }),
    )
  })

  it('rechaza tokens vencidos, usados o de otro propósito con TOKEN_INVALID', async () => {
    const { service, authTokenService } = build()
    authTokenService.consume.mockResolvedValue(null)

    await expect(service.verifyEmail('x'.repeat(20))).rejects.toMatchObject({ response: { code: 'TOKEN_INVALID' } })
    await expect(service.resetPassword('x'.repeat(20), 'nueva-clave')).rejects.toMatchObject({
      response: { code: 'TOKEN_INVALID' },
    })
  })

  it('olvidé mi contraseña no revela si el email existe y respeta la espera entre envíos', async () => {
    const { service, userRepository, authTokenService, mailService } = build()
    userRepository.findByEmailGlobal.mockResolvedValue(null)
    await expect(service.forgotPassword('nadie@acme.com')).resolves.toBeUndefined()
    expect(mailService.send).not.toHaveBeenCalled()

    userRepository.findByEmailGlobal.mockResolvedValue(userDoc())
    authTokenService.inCooldown.mockResolvedValue(true)
    await service.forgotPassword('ana@acme.com')
    expect(mailService.send).not.toHaveBeenCalled()
  })

  it('restablecer la contraseña también verifica el email', async () => {
    const { service, authTokenService, userRepository } = build()
    authTokenService.consume.mockResolvedValue({ user_id: new Types.ObjectId() })
    userRepository.findByIdGlobal.mockResolvedValue(userDoc({ email_verified_at: null }))

    await service.resetPassword('raw-token', 'nueva-clave-segura')

    expect(userRepository.updateByIdGlobal).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ password_hash: 'hashed', email_verified_at: expect.any(Date) }),
    )
  })

  it('aceptar la invitación activa al usuario, fija su contraseña y lo marca verificado', async () => {
    const { service, authTokenService, userRepository } = build()
    authTokenService.consume.mockResolvedValue({ user_id: new Types.ObjectId() })
    userRepository.findByIdGlobal.mockResolvedValue(userDoc({ status: UserStatus.INVITED }))

    await service.acceptInvitation('raw-token', 'nueva-clave-segura', 'Ana P.')

    expect(userRepository.updateByIdGlobal).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: UserStatus.ACTIVE, password_hash: 'hashed', name: 'Ana P.' }),
    )
  })

  it('una invitación ya aceptada no se puede reutilizar', async () => {
    const { service, authTokenService, userRepository } = build()
    authTokenService.consume.mockResolvedValue({ user_id: new Types.ObjectId() })
    userRepository.findByIdGlobal.mockResolvedValue(userDoc({ status: UserStatus.ACTIVE }))

    await expect(service.acceptInvitation('raw-token', 'nueva-clave-segura')).rejects.toMatchObject({
      response: { code: 'TOKEN_INVALID' },
    })
  })
})
