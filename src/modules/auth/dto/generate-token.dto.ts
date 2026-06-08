import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'

const schema = z.object({
  email: z.string().email(),
})

export class GenerateTokenDto extends createZodDto(schema) {}
