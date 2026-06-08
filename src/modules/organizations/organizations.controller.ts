import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common'
import { OrganizationsService } from './organizations.service'
import { CreateOrganizationDto } from './dto/create-organization.dto'

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  create(@Body() dto: CreateOrganizationDto) {
    return this.organizationsService.create(dto)
  }

  @Get()
  findAll() {
    return this.organizationsService.findAll()
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.organizationsService.findOne(id)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateOrganizationDto>) {
    return this.organizationsService.update(id, dto)
  }
}
