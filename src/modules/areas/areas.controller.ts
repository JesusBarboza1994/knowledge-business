import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { AreasService } from './areas.service'
import { CreateAreaDto } from './dto/create-area.dto'

@Controller('areas')
export class AreasController {
  constructor(private readonly areasService: AreasService) {}

  @Post()
  create(@Body() dto: CreateAreaDto) {
    return this.areasService.create(dto)
  }

  @Get()
  findAll(@Query('tenant') tenant: string) {
    return this.areasService.findAll(tenant)
  }

  @Patch(':tenant/:key')
  update(
    @Param('tenant') tenant: string,
    @Param('key') key: string,
    @Body() dto: Partial<CreateAreaDto>,
  ) {
    return this.areasService.update(tenant, key, dto)
  }
}
