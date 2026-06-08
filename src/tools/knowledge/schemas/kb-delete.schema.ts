import { z } from 'zod'

export const kbDeleteSchema = {
  id: z.string().describe('Note id'),
  base_version: z.number().int().describe('Current version for optimistic lock'),
}
