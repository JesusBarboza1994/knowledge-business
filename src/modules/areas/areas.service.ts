import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { AreaRepository } from '@/repository/schemas/area/area.repository'
import { CreateAreaDto } from './dto/create-area.dto'

@Injectable()
export class AreasService {
  constructor(private readonly areaRepository: AreaRepository) {}

  async create(dto: CreateAreaDto) {
    const existing = await this.areaRepository.findByKey(dto.tenant, dto.key)
    if (existing) throw new ConflictException(`Area "${dto.key}" already exists in tenant "${dto.tenant}"`)
    return this.areaRepository.create(dto)
  }

  async findAll(tenant: string) {
    return this.areaRepository.findAllByTenant(tenant)
  }

  async update(tenant: string, key: string, dto: Partial<CreateAreaDto>) {
    const area = await this.areaRepository.update(tenant, key, dto)
    if (!area) throw new NotFoundException(`Area "${key}" not found in tenant "${tenant}"`)
    return area
  }
}
