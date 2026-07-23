import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { UserRepository } from '@/repository/schemas/user/user.repository'
import { PasswordService } from '@/providers/password/password.service'
import { CreateUserDto } from './dto/create-user.dto'
import { InviteUserDto, UpdateUserAccessDto } from './dto/invite-user.dto'
import { UserStatus } from '@/commons/enums'
import { User } from '@/repository/schemas/user/user.schema'

@Injectable()
export class UsersService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordService: PasswordService,
  ) {}

  async create(dto: CreateUserDto) {
    const existing = await this.userRepository.findByEmail(dto.tenant, dto.email)
    if (existing) throw new ConflictException(`User "${dto.email}" already exists in tenant "${dto.tenant}"`)

    const { password, memberships, ...rest } = dto
    const password_hash = await this.passwordService.hash(password)
    return this.userRepository.create({
      ...rest,
      memberships: memberships.map((m) => ({ ...m, granted_at: new Date() })),
      password_hash,
    })
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

  async invite(tenant: string, dto: InviteUserDto, grantedBy: string) {
    const existing = await this.userRepository.findByEmailAnyStatus(tenant, dto.email)
    if (existing) throw new ConflictException(`User "${dto.email}" already exists`)
    return this.userRepository.create({
      tenant,
      email: dto.email,
      name: dto.name,
      role: dto.role,
      status: UserStatus.INVITED,
      memberships: dto.memberships.map((membership) => ({
        ...membership,
        granted_at: new Date(),
        granted_by: grantedBy,
      })),
    })
  }

  async updateAccess(tenant: string, id: string, dto: UpdateUserAccessDto, grantedBy: string) {
    const existing = await this.userRepository.findById(tenant, id)
    if (!existing) throw new NotFoundException('User not found')
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
