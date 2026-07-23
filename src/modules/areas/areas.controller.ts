import { Body, Controller, ForbiddenException, Get, Param, Patch, Post } from '@nestjs/common'
import { AreasService } from './areas.service'
import { CreateAreaDto } from './dto/create-area.dto'
import { CurrentUser } from '@/commons/decorators/current-user.decorator'
import { UserProfile, isTenantAdmin } from '@/tools/user-profile.type'
import { AreaAccess } from '@/commons/enums'

@Controller('areas')
export class AreasController {
  constructor(private readonly areasService: AreasService) {}

  @Post()
  create(@Body() dto: CreateAreaDto, @CurrentUser() user: UserProfile) {
    if (!isTenantAdmin(user)) throw new ForbiddenException('Tenant admin role required')
    return this.areasService.create({ ...dto, tenant: user.tenant })
  }

  @Get()
  findAll(@CurrentUser() user: UserProfile) {
    return this.areasService.findAll(user.tenant)
  }

  @Patch(':key')
  update(@Param('key') key: string, @Body() dto: Partial<CreateAreaDto>, @CurrentUser() user: UserProfile) {
    const canManage =
      isTenantAdmin(user) ||
      user.memberships.some((membership) => membership.area === key && membership.access === AreaAccess.MANAGE)
    if (!canManage) throw new ForbiddenException('Area manage access required')
    const { tenant: _ignoredTenant, ...patch } = dto
    return this.areasService.update(user.tenant, key, patch)
  }
}
