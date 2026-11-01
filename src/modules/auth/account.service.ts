import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { UserRepository } from '@/repository/schemas/user/user.repository'
import { UserDocument, isEmailVerified } from '@/repository/schemas/user/user.schema'
import { OrganizationRepository } from '@/repository/schemas/organization/organization.repository'
import { PasswordService } from '@/providers/password/password.service'
import { AuthTokenService } from '@/providers/auth-token/auth-token.service'
import { MailService } from '@/providers/mail/mail.service'
import {
  invitationTemplate,
  resetPasswordTemplate,
  verifyEmailTemplate,
} from '@/providers/mail/templates/account.templates'
import { AuthTokenPurpose, OrganizationPlan, OrganizationStatus, UserRole, UserStatus } from '@/commons/enums'
import { ErrorCode, errorBody, isDuplicateKeyError } from '@/commons/constants/error-code.constant'
import { AppConfig } from '@/settings/settings.model'
import { SLUG_PATTERN, SignupDto } from './dto/account.dto'

/** Slugs that would read as part of the product rather than a customer. */
const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'app',
  'auth',
  'billing',
  'help',
  'login',
  'mcp',
  'oauth',
  'root',
  'soporte',
  'support',
  'system',
  'www',
])

/** Front routes the emailed links open. Keep in sync with knowledge-frontend's router. */
export const ACCOUNT_LINK_PATHS = {
  [AuthTokenPurpose.VERIFY_EMAIL]: '/verificar-email',
  [AuthTokenPurpose.RESET_PASSWORD]: '/restablecer-contrasena',
  [AuthTokenPurpose.INVITE]: '/invitacion',
} as const

export interface SignupResult {
  email: string
  organization: string
  /** False when the verification email could not be sent; the front offers "reenviar". */
  verification_sent: boolean
}

export type SlugAvailability = { slug: string; available: boolean; reason?: 'taken' | 'reserved' | 'invalid' }

/**
 * Self-service account lifecycle: sign-up, email verification, password reset, invitations.
 * Endpoints that take only an email answer the same whether or not the account exists, so they
 * cannot be used to discover who is registered.
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name)
  private readonly frontendUrl: string

  constructor(
    private readonly userRepository: UserRepository,
    private readonly organizationRepository: OrganizationRepository,
    private readonly passwordService: PasswordService,
    private readonly authTokenService: AuthTokenService,
    private readonly mailService: MailService,
    configService: ConfigService,
  ) {
    this.frontendUrl = configService.get<AppConfig>('app')?.frontendUrl ?? 'http://localhost:5173'
  }

  // ─── Sign-up ─────────────────────────────────────────────────────────────

  async checkSlug(raw: string): Promise<SlugAvailability> {
    const slug = raw.trim().toLowerCase()
    if (slug.length < 2 || slug.length > 40 || !SLUG_PATTERN.test(slug)) {
      return { slug, available: false, reason: 'invalid' }
    }
    if (RESERVED_SLUGS.has(slug)) return { slug, available: false, reason: 'reserved' }
    if (await this.organizationRepository.existsBySlug(slug)) return { slug, available: false, reason: 'taken' }
    return { slug, available: true }
  }

  /**
   * Creates the organization (plan free) and its first admin, unverified. Mongo runs without a
   * replica set here, so instead of a transaction the organization is removed again if the admin
   * cannot be created.
   */
  async signup(dto: SignupDto): Promise<SignupResult> {
    const slug = await this.checkSlug(dto.slug)
    if (!slug.available) throw this.slugTaken(dto.slug)
    if (await this.userRepository.existsByEmail(dto.email)) throw this.emailTaken()

    let organization
    try {
      organization = await this.organizationRepository.create({
        slug: slug.slug,
        name: dto.organization_name,
        description: dto.description,
        phone_country_code: dto.phone_country_code,
        phone_number: dto.phone_number,
        plan: OrganizationPlan.FREE,
        status: OrganizationStatus.ACTIVE,
      })
    } catch (error) {
      if (isDuplicateKeyError(error)) throw this.slugTaken(dto.slug)
      throw error
    }

    let user: UserDocument
    try {
      user = await this.userRepository.create({
        tenant: organization.slug,
        email: dto.email,
        name: dto.name,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        memberships: [],
        password_hash: await this.passwordService.hash(dto.password),
        email_verified_at: null,
      })
    } catch (error) {
      await this.organizationRepository.deleteById(organization._id.toString())
      if (isDuplicateKeyError(error)) throw this.emailTaken()
      throw error
    }

    const verification_sent = await this.sendVerification(user, organization.name)
    return { email: user.email, organization: organization.slug, verification_sent }
  }

  // ─── Email verification ──────────────────────────────────────────────────

  /** Marks the email as verified and returns the user, so the caller can open a session. */
  async verifyEmail(token: string): Promise<UserDocument> {
    const record = await this.authTokenService.consume(token, AuthTokenPurpose.VERIFY_EMAIL)
    if (!record) throw this.tokenInvalid()
    const user = await this.userRepository.updateByIdGlobal(record.user_id.toString(), {
      email_verified_at: new Date(),
    })
    if (!user || user.status !== UserStatus.ACTIVE) throw this.tokenInvalid()
    return user
  }

  async resendVerification(email: string): Promise<void> {
    const user = await this.userRepository.findByEmailGlobal(email)
    if (!user || isEmailVerified(user)) return
    if (await this.authTokenService.inCooldown(user._id, AuthTokenPurpose.VERIFY_EMAIL)) return
    const organization = await this.organizationRepository.findBySlug(user.tenant)
    await this.sendVerification(user, organization?.name ?? user.tenant)
  }

  private async sendVerification(user: UserDocument, organizationName: string): Promise<boolean> {
    const token = await this.authTokenService.issue(user, AuthTokenPurpose.VERIFY_EMAIL)
    return this.deliver(user.email, () =>
      verifyEmailTemplate({ name: user.name, organizationName, link: this.link(AuthTokenPurpose.VERIFY_EMAIL, token) }),
    )
  }

  // ─── Password reset ──────────────────────────────────────────────────────

  async forgotPassword(email: string): Promise<void> {
    const user = await this.userRepository.findByEmailGlobal(email)
    if (!user) return
    if (await this.authTokenService.inCooldown(user._id, AuthTokenPurpose.RESET_PASSWORD)) return
    const token = await this.authTokenService.issue(user, AuthTokenPurpose.RESET_PASSWORD)
    await this.deliver(user.email, () =>
      resetPasswordTemplate({ name: user.name, link: this.link(AuthTokenPurpose.RESET_PASSWORD, token) }),
    )
  }

  /** Following the emailed link proves ownership of the address, so it also counts as verification. */
  async resetPassword(token: string, password: string): Promise<void> {
    const record = await this.authTokenService.consume(token, AuthTokenPurpose.RESET_PASSWORD)
    if (!record) throw this.tokenInvalid()
    const user = await this.userRepository.findByIdGlobal(record.user_id.toString())
    if (!user || user.status !== UserStatus.ACTIVE) throw this.tokenInvalid()
    await this.userRepository.updateByIdGlobal(user._id.toString(), {
      password_hash: await this.passwordService.hash(password),
      ...(isEmailVerified(user) ? {} : { email_verified_at: new Date() }),
    })
  }

  // ─── Invitations ─────────────────────────────────────────────────────────

  /** Emails an invitation to a user in INVITED status. Returns whether the email went out. */
  async sendInvitation(user: UserDocument, inviterName: string): Promise<boolean> {
    if (user.status !== UserStatus.INVITED) {
      throw new BadRequestException('Only invited users can receive an invitation')
    }
    const organization = await this.organizationRepository.findBySlug(user.tenant)
    const token = await this.authTokenService.issue(user, AuthTokenPurpose.INVITE)
    return this.deliver(user.email, () =>
      invitationTemplate({
        name: user.name,
        organizationName: organization?.name ?? user.tenant,
        inviterName,
        link: this.link(AuthTokenPurpose.INVITE, token),
      }),
    )
  }

  /** What the acceptance screen shows before the invitee sets a password. Does not consume the token. */
  async getInvitation(token: string): Promise<{ email: string; name?: string; organization_name: string }> {
    const record = await this.authTokenService.peek(token, AuthTokenPurpose.INVITE)
    if (!record) throw this.tokenInvalid()
    const user = await this.userRepository.findByIdGlobal(record.user_id.toString())
    if (!user || user.status !== UserStatus.INVITED) throw this.tokenInvalid()
    const organization = await this.organizationRepository.findBySlug(user.tenant)
    return { email: user.email, name: user.name, organization_name: organization?.name ?? user.tenant }
  }

  async acceptInvitation(token: string, password: string, name?: string): Promise<UserDocument> {
    const record = await this.authTokenService.consume(token, AuthTokenPurpose.INVITE)
    if (!record) throw this.tokenInvalid()
    const user = await this.userRepository.findByIdGlobal(record.user_id.toString())
    if (!user || user.status !== UserStatus.INVITED) throw this.tokenInvalid()
    const updated = await this.userRepository.updateByIdGlobal(user._id.toString(), {
      status: UserStatus.ACTIVE,
      password_hash: await this.passwordService.hash(password),
      email_verified_at: new Date(),
      ...(name ? { name } : {}),
    })
    if (!updated) throw this.tokenInvalid()
    return updated
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private link(purpose: AuthTokenPurpose, token: string): string {
    const url = new URL(ACCOUNT_LINK_PATHS[purpose], `${this.frontendUrl}/`)
    url.searchParams.set('token', token)
    return url.toString()
  }

  /** A failed email never undoes the account change that triggered it; the user can ask again. */
  private async deliver(to: string, render: () => ReturnType<typeof verifyEmailTemplate>): Promise<boolean> {
    try {
      await this.mailService.send({ to, ...render() })
      return true
    } catch (error) {
      this.logger.error(`Could not email ${to}: ${(error as Error).message}`)
      return false
    }
  }

  private slugTaken(slug: string) {
    return new ConflictException(errorBody(ErrorCode.SLUG_TAKEN, `The organization URL "${slug}" is not available`))
  }

  private emailTaken() {
    return new ConflictException(errorBody(ErrorCode.EMAIL_TAKEN, 'This email already belongs to an organization'))
  }

  private tokenInvalid() {
    return new BadRequestException(errorBody(ErrorCode.TOKEN_INVALID, 'This link is invalid or has expired'))
  }
}
