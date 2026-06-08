import { z } from 'zod'

export const kbSearchSchema = {
  query: z.string().describe('Natural language search query'),
  limit: z.number().int().min(1).max(50).optional().describe('Max results (default 10)'),
}
