import { z } from 'zod'

export const pingSchema = {
  message: z.string().optional().describe('Optional message to echo back'),
}
