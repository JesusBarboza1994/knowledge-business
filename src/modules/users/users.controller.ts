import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { UsersService } from './users.service'
import { CreateUserDto } from './dto/create-user.dto'
import { SetPasswordDto } from './dto/set-password.dto'

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto)
  }

  @Get()
  findAll(@Query('tenant') tenant: string) {
    return this.usersService.findAll(tenant)
  }

  @Patch(':tenant/:email')
  update(
    @Param('tenant') tenant: string,
    @Param('email') email: string,
    @Body() dto: Partial<CreateUserDto>,
  ) {
    return this.usersService.update(tenant, email, dto)
  }

  @Patch(':tenant/:email/password')
  setPassword(
    @Param('tenant') tenant: string,
    @Param('email') email: string,
    @Body() dto: SetPasswordDto,
  ) {
    return this.usersService.setPassword(tenant, email, dto.password)
  }
}
