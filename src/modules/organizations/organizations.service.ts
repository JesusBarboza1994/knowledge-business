import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AppConfig } from '@/settings/settings.model'
import { OrganizationRepository } from '@/repository/schemas/organization/organization.repository'
import { CreateOrganizationDto } from './dto/create-organization.dto'

export const PRODUCT_NAME = 'NoesisHub'

@Injectable()
export class OrganizationsService {
  private readonly publicUrl: string

  constructor(
    private readonly organizationRepository: OrganizationRepository,
    configService: ConfigService,
  ) {
    this.publicUrl = configService.get<AppConfig>('app')?.publicUrl ?? 'http://localhost:3000'
  }

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

  /** Idempotent: finishing the wizard twice keeps the first timestamp. */
  async completeOnboarding(slug: string) {
    const org = await this.findBySlug(slug)
    if (org.onboarding_completed_at) return org
    const updated = await this.organizationRepository.updateBySlug(slug, { onboarding_completed_at: new Date() })
    if (!updated) throw new NotFoundException('Organization not found')
    return updated
  }

  /** What a member needs to connect an AI client: one MCP URL for every tenant (the token picks it). */
  connectInfo() {
    return { product_name: PRODUCT_NAME, mcp_url: `${this.publicUrl}/mcp`, auth: 'oauth' as const }
  }

  async update(id: string, dto: Partial<CreateOrganizationDto>) {
    const org = await this.organizationRepository.update(id, dto)
    if (!org) throw new NotFoundException(`Organization not found`)
    return org
  }
}
