import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { OrganizationRepository } from '@/repository/schemas/organization/organization.repository'
import { CreateOrganizationDto } from './dto/create-organization.dto'

@Injectable()
export class OrganizationsService {
  constructor(private readonly organizationRepository: OrganizationRepository) {}

  async create(dto: CreateOrganizationDto) {
    const existing = await this.organizationRepository.findBySlug(dto.slug)
    if (existing) throw new ConflictException(`Organization with slug "${dto.slug}" already exists`)
    return this.organizationRepository.create(dto)
  }

  async findAll() {
    return this.organizationRepository.findAll()
  }

  async findOne(id: string) {
    const org = await this.organizationRepository.findById(id)
    if (!org) throw new NotFoundException(`Organization not found`)
    return org
  }

  async findBySlug(slug: string) {
    const org = await this.organizationRepository.findBySlug(slug)
    if (!org) throw new NotFoundException('Organization not found')
    return org
  }

  async update(id: string, dto: Partial<CreateOrganizationDto>) {
    const org = await this.organizationRepository.update(id, dto)
    if (!org) throw new NotFoundException(`Organization not found`)
    return org
  }
}
