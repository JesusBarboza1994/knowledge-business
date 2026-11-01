import { z } from 'zod'
import { Sensitivity, WRITABLE_NOTE_KINDS } from '@/commons/enums'

export const kbCreateSchema = {
  area: z.string().describe('Area key this note belongs to'),
  title: z.string().describe('Note title (used to derive the slug)'),
  body: z.string().describe('Markdown content. Use [[Note Title]] syntax for internal links'),
  kind: z
    .enum(WRITABLE_NOTE_KINDS)
    .optional()
    .describe(
      'note (default) = regular note, hangs from a main note via parent. main = a main branch of the area, listed in the area index. Create a main only for a genuinely new subject of the area.',
    ),
  parent: z
    .string()
    .optional()
    .describe(
      'Title or slug of the main note this note hangs from. Required in practice for kind "note" — a note without a parent is reachable from nothing and kb_lint reports it as an orphan. Leave empty on a top-level main note.',
    ),
  sensitivity: z.nativeEnum(Sensitivity).optional(),
  visible_to: z.array(z.string()).optional().describe('Area keys that can view this note (internal_area only)'),
}
