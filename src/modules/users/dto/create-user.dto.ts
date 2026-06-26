import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'

const schema = z.object({
  tenant: z.string(),
  email: z.string().email(),
  password: z.string().min(6),
  areas: z.array(z.string()).default([]),
  role: z.enum(['viewer', 'editor', 'area_admin', 'admin']).default('viewer'),
  occupation: z.string().optional(),
})

export class CreateUserDto extends createZodDto(schema) {}
