import { z } from 'zod'
import { Sensitivity } from '@/commons/enums'

export const kbUpdateSchema = {
  id: z.string().describe('Note id'),
  base_version: z.number().int().describe('Current version for optimistic lock'),
  body: z.string().optional().describe('New markdown body'),
  title: z.string().optional().describe('New title'),
  sensitivity: z.nativeEnum(Sensitivity).optional(),
  visible_to: z.array(z.string()).optional(),
}
