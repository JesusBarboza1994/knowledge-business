import { z } from 'zod'
import { NoteKind, Sensitivity } from '@/commons/enums'

const batchNoteSchema = z.object({
  area: z.string().min(1).max(40).describe('Area key this note belongs to'),
  title: z.string().min(1).max(200).describe('Note title'),
  slug: z.string().min(1).max(200).optional().describe('Optional stable slug; derived from title when omitted'),
  aliases: z.array(z.string().min(1).max(200)).max(20).optional().describe('Optional alternative names for wikilinks'),
  kind: z.nativeEnum(NoteKind).optional().describe('Defaults to note'),
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
