import { z } from 'zod'
import { Sensitivity } from '@/commons/enums'

export const kbCreateSchema = {
  area: z.string().describe('Area key this note belongs to'),
  title: z.string().describe('Note title (used to derive the slug)'),
  body: z.string().describe('Markdown content. Use [[Note Title]] syntax for internal links'),
  sensitivity: z.nativeEnum(Sensitivity).optional(),
  visible_to: z.array(z.string()).optional().describe('Area keys that can view this note (internal_area only)'),
}
