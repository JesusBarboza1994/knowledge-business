import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'
import { OrganizationPlan, Sensitivity } from '@/commons/enums'

const schema = z.object({
  slug: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/),
  name: z.string().min(2).max(100),
  plan: z.nativeEnum(OrganizationPlan).optional(),
  default_sensitivity: z.nativeEnum(Sensitivity).optional(),
})

export class CreateOrganizationDto extends createZodDto(schema) {}
