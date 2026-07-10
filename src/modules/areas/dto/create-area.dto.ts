import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'
import { Sensitivity } from '@/commons/enums'

const schema = z.object({
  tenant: z.string(),
  key: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/),
  name: z.string().min(2).max(100),
  description: z.string().optional(),
  default_sensitivity: z.nativeEnum(Sensitivity).optional(),
})

export class CreateAreaDto extends createZodDto(schema) {}
