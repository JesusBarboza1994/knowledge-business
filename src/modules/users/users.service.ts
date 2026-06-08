import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { UserRepository } from '@/repository/schemas/user/user.repository'
import { CreateUserDto } from './dto/create-user.dto'

@Injectable()
export class UsersService {
  constructor(private readonly userRepository: UserRepository) {}

  async create(dto: CreateUserDto) {
    const existing = await this.userRepository.findByEmail(dto.tenant, dto.email)
    if (existing) throw new ConflictException(`User "${dto.email}" already exists in tenant "${dto.tenant}"`)
    return this.userRepository.create(dto)
  }

  async findAll(tenant: string) {
    return this.userRepository.findAllByTenant(tenant)
  }

  async update(tenant: string, email: string, dto: Partial<CreateUserDto>) {
    const user = await this.userRepository.update(tenant, email, dto)
    if (!user) throw new NotFoundException(`User "${email}" not found in tenant "${tenant}"`)
    return user
  }
}
