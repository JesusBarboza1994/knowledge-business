import { z } from 'zod'

export const kbGetSchema = {
  ref: z.string().describe('Note slug, alias, or id'),
}
