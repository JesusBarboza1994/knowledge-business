import { z } from 'zod'
import { Sensitivity } from '@/commons/enums'

export const kbMoveSchema = {
  id: z.string().describe('Note id'),
  base_version: z.number().int().describe('Current version for optimistic lock'),
  area: z
    .string()
    .optional()
    .describe('Target area key to move the note into. Requires write access in both the current and target area.'),
  sensitivity: z.nativeEnum(Sensitivity).optional().describe('New sensitivity level for the note.'),
  visible_to: z
    .array(z.string())
    .optional()
    .describe('Area keys this note is shared with when sensitivity is internal_area.'),
}
