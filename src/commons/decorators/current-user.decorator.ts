import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { UserProfile } from '@/tools/user-profile.type'

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): UserProfile => {
  const request = context.switchToHttp().getRequest<{ user: UserProfile }>()
  return request.user
})
