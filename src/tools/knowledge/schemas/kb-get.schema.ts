import { z } from 'zod'

export const kbGetSchema = {
  ref: z.string().describe('Note slug, alias, or id'),
  mode: z
    .enum(['preview', 'full'])
    .optional()
    .describe('preview returns a compact/truncated body by default; full returns the complete note body'),
  heading: z
    .string()
    .optional()
    .describe('Optional heading text to return only that section instead of the whole note'),
  max_chars: z
    .number()
    .int()
    .min(200)
    .max(6000)
    .optional()
    .describe('Maximum body characters returned in preview mode; defaults to 1800'),
}
