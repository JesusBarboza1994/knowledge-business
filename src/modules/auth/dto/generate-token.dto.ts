import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

export class GenerateTokenDto extends createZodDto(schema) {}
