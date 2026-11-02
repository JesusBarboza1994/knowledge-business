import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { AreaRepository } from '@/repository/schemas/area/area.repository'
import { CreateAreaDto } from './dto/create-area.dto'
import { ErrorCode, errorBody, isDuplicateKeyError } from '@/commons/constants/error-code.constant'

@Injectable()
export class AreasService {
  constructor(private readonly areaRepository: AreaRepository) {}

  async create(dto: CreateAreaDto) {
    if (await this.areaRepository.existsByKey(dto.tenant, dto.key)) throw this.keyTaken(dto.key)
    try {
      return await this.areaRepository.create(dto)
    } catch (error) {
      if (isDuplicateKeyError(error)) throw this.keyTaken(dto.key)
      throw error
    }
  }

  /** Archived areas keep their key reserved, so the message must not imply the key is free. */
  private keyTaken(key: string) {
    return new ConflictException(
      errorBody(ErrorCode.AREA_KEY_TAKEN, `Area key "${key}" is already in use (possibly by an archived area)`),
    )
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
