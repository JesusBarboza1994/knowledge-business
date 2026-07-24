import { Body, Controller, ForbiddenException, Get, Param, Patch, Post } from '@nestjs/common'
import { UsersService } from './users.service'
import { CreateUserDto } from './dto/create-user.dto'
import { SetPasswordDto } from './dto/set-password.dto'
import { InviteUserDto, UpdateUserAccessDto } from './dto/invite-user.dto'
import { CurrentUser } from '@/commons/decorators/current-user.decorator'
import { UserProfile, isTenantAdmin } from '@/tools/user-profile.type'
import { UserRole } from '@/commons/enums'

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() user: UserProfile) {
    if (user.role !== UserRole.SUPERADMIN) throw new ForbiddenException('Superadmin role required')
    return this.usersService.create(dto)
  }

  @Get()
  findAll(@CurrentUser() user: UserProfile) {
    this.assertTenantAdmin(user)
    return this.usersService.findAll(user.tenant)
  }

  @Post('invite')
  invite(@Body() dto: InviteUserDto, @CurrentUser() user: UserProfile) {
    this.assertTenantAdmin(user)
    if (dto.role === UserRole.SUPERADMIN && user.role !== UserRole.SUPERADMIN) {
      throw new ForbiddenException('Only a superadmin can grant the superadmin role')
    }
    return this.usersService.invite(user.tenant, dto, user.email)
  }

  @Patch(':id')
  updateAccess(@Param('id') id: string, @Body() dto: UpdateUserAccessDto, @CurrentUser() user: UserProfile) {
    this.assertTenantAdmin(user)
    if (dto.role === UserRole.SUPERADMIN && user.role !== UserRole.SUPERADMIN) {
      throw new ForbiddenException('Only a superadmin can grant the superadmin role')
    }
    return this.usersService.updateAccess(user.tenant, id, dto, user.email, { id: user.id, role: user.role })
  }

  @Patch(':email/password')
  setPassword(@Param('email') email: string, @Body() dto: SetPasswordDto, @CurrentUser() user: UserProfile) {
    this.assertTenantAdmin(user)
    return this.usersService.setPassword(user.tenant, email, dto.password)
  }

  private assertTenantAdmin(user: UserProfile): void {
    if (!isTenantAdmin(user)) throw new ForbiddenException('Tenant admin role required')
  }
}
