import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'

const schema = z.object({
  tenant: z.string(),
  key: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/),
  name: z.string().min(2).max(100),
  description: z.string().optional(),
  default_sensitivity: z.enum(['public_org', 'internal_area', 'confidential']).optional(),
})

export class CreateAreaDto extends createZodDto(schema) {}
