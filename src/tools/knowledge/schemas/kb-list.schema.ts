import { z } from 'zod'
import { NoteKind } from '@/commons/enums'

export const kbListSchema = {
  limit: z.number().int().min(1).max(200).optional().describe('Max results (default 50)'),
  area: z.string().optional().describe('Restrict to one area key'),
  kind: z.nativeEnum(NoteKind).optional().describe('Filter by kind. Pass "main" to list the area\'s main branches.'),
  parent: z.string().optional().describe('Slug of a main note: returns only the notes hanging from it'),
  orphans: z
    .boolean()
    .optional()
    .describe('Only notes with no parent — the ones unreachable from the index through a main note'),
}
