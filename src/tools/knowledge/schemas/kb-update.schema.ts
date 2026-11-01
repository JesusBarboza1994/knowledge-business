import { z } from 'zod'
import { Sensitivity, WRITABLE_NOTE_KINDS } from '@/commons/enums'

export const kbUpdateSchema = {
  id: z.string().describe('Note id'),
  base_version: z.number().int().describe('Current version for optimistic lock'),
  body: z.string().optional().describe('New markdown body'),
  title: z.string().optional().describe('New title'),
  kind: z
    .enum(WRITABLE_NOTE_KINDS)
    .optional()
    .describe(
      'Promote a note to "main" (it becomes a branch listed in the area index) or demote it back to "note". A main is a regular note in every other respect — it is edited, linked, moved and archived like any other.',
    ),
  parent: z
    .string()
    .nullable()
    .optional()
    .describe('Title or slug of the main note this note should hang from. Pass null to detach it.'),
  sensitivity: z.nativeEnum(Sensitivity).optional(),
  visible_to: z.array(z.string()).optional(),
}
