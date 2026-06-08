import { z } from 'zod'

export const kbLinksSchema = {
  ref: z.string().describe('Note slug or alias'),
  dir: z.enum(['out', 'in', 'both']).default('out').describe('Link direction'),
}
