import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'

const schema = z.object({
  password: z.string().min(8),
})

export class SetPasswordDto extends createZodDto(schema) {}
