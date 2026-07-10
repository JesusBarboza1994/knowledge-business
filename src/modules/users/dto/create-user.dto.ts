import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'
import { AreaAccess, UserRole } from '@/commons/enums'

const membershipSchema = z.object({
  area: z.string(),
  access: z.nativeEnum(AreaAccess),
  granted_by: z.string().email().optional(),
})

const schema = z.object({
  tenant: z.string(),
  email: z.string().email(),
  password: z.string().min(6),
  memberships: z.array(membershipSchema).default([]),
  role: z.nativeEnum(UserRole).default(UserRole.MEMBER),
  occupation: z.string().optional(),
})

export class CreateUserDto extends createZodDto(schema) {}
