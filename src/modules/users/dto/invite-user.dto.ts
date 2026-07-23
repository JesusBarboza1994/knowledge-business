import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'
import { AreaAccess, UserRole, UserStatus } from '@/commons/enums'

const membershipSchema = z.object({
  area: z.string().min(1).max(40),
  access: z.nativeEnum(AreaAccess),
})

export class InviteUserDto extends createZodDto(
  z.object({
    email: z.string().email(),
    name: z.string().min(2).max(120),
    memberships: z.array(membershipSchema).default([]),
    role: z.nativeEnum(UserRole).default(UserRole.MEMBER),
  }),
) {}

export class UpdateUserAccessDto extends createZodDto(
  z.object({
    name: z.string().min(2).max(120).optional(),
    memberships: z.array(membershipSchema).optional(),
    role: z.nativeEnum(UserRole).optional(),
    status: z.nativeEnum(UserStatus).optional(),
  }),
) {}
