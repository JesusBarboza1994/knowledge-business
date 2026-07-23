import { Body, Controller, ForbiddenException, Get, Param, Patch, Post } from '@nestjs/common'
import { OrganizationsService } from './organizations.service'
import { CreateOrganizationDto } from './dto/create-organization.dto'
import { CurrentUser } from '@/commons/decorators/current-user.decorator'
import { UserProfile } from '@/tools/user-profile.type'
import { UserRole } from '@/commons/enums'

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  create(@Body() dto: CreateOrganizationDto, @CurrentUser() user: UserProfile) {
    this.assertSuperadmin(user)
    return this.organizationsService.create(dto)
  }

  @Get()
  findAll(@CurrentUser() user: UserProfile) {
    this.assertSuperadmin(user)
    return this.organizationsService.findAll()
  }

  @Get('current')
  findCurrent(@CurrentUser() user: UserProfile) {
    return this.organizationsService.findBySlug(user.tenant)
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: UserProfile) {
    this.assertSuperadmin(user)
    return this.organizationsService.findOne(id)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateOrganizationDto>, @CurrentUser() user: UserProfile) {
    this.assertSuperadmin(user)
    return this.organizationsService.update(id, dto)
  }

  private assertSuperadmin(user: UserProfile): void {
    if (user.role !== UserRole.SUPERADMIN) throw new ForbiddenException('Superadmin role required')
  }
}
