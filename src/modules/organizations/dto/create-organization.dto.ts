import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'

const schema = z.object({
  slug: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/),
  name: z.string().min(2).max(100),
  plan: z.enum(['free', 'pro', 'enterprise']).optional(),
  default_sensitivity: z.enum(['public_org', 'internal_area', 'confidential']).optional(),
})

export class CreateOrganizationDto extends createZodDto(schema) {}
