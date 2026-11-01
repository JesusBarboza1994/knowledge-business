import { z } from 'zod'
import { Sensitivity, WRITABLE_NOTE_KINDS } from '@/commons/enums'

const batchNoteSchema = z.object({
  area: z.string().min(1).max(40).describe('Area key this note belongs to'),
  title: z.string().min(1).max(200).describe('Note title'),
  slug: z.string().min(1).max(200).optional().describe('Optional stable slug; derived from title when omitted'),
  aliases: z.array(z.string().min(1).max(200)).max(20).optional().describe('Optional alternative names for wikilinks'),
  kind: z
    .enum(WRITABLE_NOTE_KINDS)
    .optional()
    .describe('note (default) = regular note. main = a main branch of the area, listed in the area index.'),
  parent: z
    .string()
    .optional()
    .describe(
      'Title or slug of the main note this note hangs from. May reference a main note created in this same chunk, in any order. Leave empty on a top-level main note.',
    ),
  body: z.string().max(2_000_000).describe('Markdown content. Use [[Title or alias]] for internal links'),
  sensitivity: z.nativeEnum(Sensitivity).optional(),
  visible_to: z.array(z.string().min(1).max(40)).max(50).optional(),
})

export const kbCreateBatchSchema = {
  notes: z
    .array(batchNoteSchema)
    .min(1)
    .max(25)
    .describe(
      'A prevalidated chunk of notes. Links between notes in this array are resolved directly regardless of array order.',
    ),
}
