import { z } from 'zod'
import { LinkDirection } from '@/commons/enums'

export const kbLinksSchema = {
  ref: z.string().describe('Note slug or alias'),
  dir: z.nativeEnum(LinkDirection).default(LinkDirection.OUT).describe('Link direction'),
}
