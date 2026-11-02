import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { Public } from '@/commons/decorators/public.decorator'
import { AccountService } from './account.service'
import { SignupDto, SlugQueryDto } from './dto/account.dto'

@Controller('signup')
export class SignupController {
  constructor(private readonly accountService: AccountService) {}

  /** POST /v1/signup — creates the organization (plan free) and its first admin, pending verification. */
  @Post()
  @Public()
  signup(@Body() dto: SignupDto) {
    return this.accountService.signup(dto)
  }

  /** GET /v1/signup/slug-availability?slug= — live check while the user types the organization URL. */
  @Get('slug-availability')
  @Public()
  slugAvailability(@Query() dto: SlugQueryDto) {
    return this.accountService.checkSlug(dto.slug)
  }
}
