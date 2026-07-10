import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { UserRepository } from '@/repository/schemas/user/user.repository'
import { PasswordService } from '@/providers/password/password.service'
import { CreateUserDto } from './dto/create-user.dto'

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

  async setPassword(tenant: string, email: string, password: string): Promise<void> {
    const user = await this.userRepository.findByEmail(tenant, email)
    if (!user) throw new NotFoundException(`User "${email}" not found in tenant "${tenant}"`)
    const hash = await this.passwordService.hash(password)
    await this.userRepository.setPasswordHash(tenant, email, hash)
  }
}
