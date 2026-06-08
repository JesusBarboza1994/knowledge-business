import { z } from 'zod'

export const kbListSchema = {
  limit: z.number().int().min(1).max(200).optional().describe('Max results (default 50)'),
}
