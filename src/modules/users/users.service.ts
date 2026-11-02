import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { UserRepository } from '@/repository/schemas/user/user.repository'
import { PasswordService } from '@/providers/password/password.service'
import { AccountService } from '@/modules/auth/account.service'
import { CreateUserDto } from './dto/create-user.dto'
import { InviteUserDto, UpdateUserAccessDto } from './dto/invite-user.dto'
import { UserRole, UserStatus } from '@/commons/enums'
import { User } from '@/repository/schemas/user/user.schema'
import { ErrorCode, errorBody, isDuplicateKeyError } from '@/commons/constants/error-code.constant'

@Injectable()
export class UsersService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordService: PasswordService,
    private readonly accountService: AccountService,
  ) {}

  async create(dto: CreateUserDto) {
    await this.assertEmailAvailable(dto.email)

    const { password, memberships, ...rest } = dto
    const password_hash = await this.passwordService.hash(password)
    return this.createUnique({
      ...rest,
      memberships: memberships.map((m) => ({ ...m, granted_at: new Date() })),
      password_hash,
    })
  }

  /** An email belongs to a single organization (see GLOBAL_EMAIL_INDEX). */
  private async assertEmailAvailable(email: string): Promise<void> {
    if (await this.userRepository.existsByEmail(email)) throw this.emailTaken()
  }

  /** The unique index is the real guard: two concurrent sign-ups pass the pre-check together. */
  private async createUnique(data: Partial<User>) {
    try {
      return await this.userRepository.create(data)
    } catch (error) {
      if (isDuplicateKeyError(error)) throw this.emailTaken()
      throw error
    }
  }

  private emailTaken() {
    return new ConflictException(errorBody(ErrorCode.EMAIL_TAKEN, 'This email already belongs to an organization'))
  }

  async update(tenant: string, email: string, dto: Partial<CreateUserDto>) {
    const { memberships, ...rest } = dto
    const data =
      memberships !== undefined
        ? { ...rest, memberships: memberships.map((m) => ({ granted_at: new Date(), ...m })) }
        : rest
    const user = await this.userRepository.update(tenant, email, data)
    if (!user) throw new NotFoundException(`User "${email}" not found in tenant "${tenant}"`)
    return user
  }

  async findAll(tenant: string) {
    return this.userRepository.findAllByTenant(tenant)
  }

  /** Creates the user as INVITED and emails the link to set a password and join. */
  async invite(tenant: string, dto: InviteUserDto, inviter: { email: string; name?: string }) {
    await this.assertEmailAvailable(dto.email)
    const user = await this.createUnique({
      tenant,
      email: dto.email,
      name: dto.name,
      role: dto.role,
      status: UserStatus.INVITED,
      memberships: dto.memberships.map((membership) => ({
        ...membership,
        granted_at: new Date(),
        granted_by: inviter.email,
      })),
    })
    const invitation_sent = await this.accountService.sendInvitation(user, inviter.name ?? inviter.email)
    return { ...user.toJSON(), invitation_sent }
  }

  async resendInvitation(tenant: string, id: string, inviter: { email: string; name?: string }) {
    const user = await this.userRepository.findById(tenant, id)
    if (!user) throw new NotFoundException('User not found')
    if (user.status !== UserStatus.INVITED) throw new ConflictException('The user already accepted the invitation')
    return { invitation_sent: await this.accountService.sendInvitation(user, inviter.name ?? inviter.email) }
  }

  async updateAccess(
    tenant: string,
    id: string,
    dto: UpdateUserAccessDto,
    grantedBy: string,
    actor: { id: string; role: UserRole },
  ) {
    const existing = await this.userRepository.findById(tenant, id)
    if (!existing) throw new NotFoundException('User not found')
    if (actor.role !== UserRole.SUPERADMIN && existing.role === UserRole.SUPERADMIN) {
      throw new ForbiddenException('Only a superadmin can modify another superadmin')
    }
    if (actor.role !== UserRole.SUPERADMIN && dto.role === UserRole.SUPERADMIN) {
      throw new ForbiddenException('Only a superadmin can grant the superadmin role')
    }
    const changesOwnAuthority =
      actor.id === id &&
      ((dto.role !== undefined && dto.role !== existing.role) ||
        (dto.status !== undefined && dto.status !== existing.status))
    if (changesOwnAuthority) {
      throw new ForbiddenException('You cannot change your own role or status')
    }
    const { memberships, ...rest } = dto
    const data: Partial<User> = {
      ...rest,
      ...(memberships === undefined
        ? {}
        : {
            memberships: memberships.map((membership) => ({
              ...membership,
              granted_at: new Date(),
              granted_by: grantedBy,
            })),
          }),
    }
    return this.userRepository.updateById(tenant, id, data)
  }

  async setPassword(tenant: string, email: string, password: string): Promise<void> {
    const user = await this.userRepository.findByEmail(tenant, email)
    if (!user) throw new NotFoundException(`User "${email}" not found in tenant "${tenant}"`)
    const hash = await this.passwordService.hash(password)
    await this.userRepository.setPasswordHash(tenant, email, hash)
  }
}
