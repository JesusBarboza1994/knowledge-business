import { z } from 'zod'

/**
 * A surgical edit against a note body. Matching is literal (exact substring), never regex. Operations
 * in an `edits` array are applied in order, each against the result of the previous one.
 */
const editOperation = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('replace'),
    find: z.string().min(1).describe('Exact text to locate. Must match exactly once unless all=true.'),
    replacement: z.string().describe('Text to put in its place.'),
    all: z
      .boolean()
      .optional()
      .describe('Replace every occurrence. Default false → the match must be unique or the edit fails.'),
  }),
  z.object({
    op: z.literal('delete'),
    find: z.string().min(1).describe('Exact text to remove. Must match exactly once unless all=true.'),
    all: z.boolean().optional().describe('Remove every occurrence. Default false → the match must be unique.'),
  }),
  z.object({
    op: z.literal('insert_after'),
    anchor: z.string().min(1).describe('Existing text after which to insert. Must match exactly once.'),
    text: z.string().describe('Text inserted immediately after the anchor (include your own newlines).'),
  }),
  z.object({
    op: z.literal('insert_before'),
    anchor: z.string().min(1).describe('Existing text before which to insert. Must match exactly once.'),
    text: z.string().describe('Text inserted immediately before the anchor (include your own newlines).'),
  }),
  z.object({
    op: z.literal('append'),
    text: z.string().describe('Text appended at the very end of the note (include a leading newline if needed).'),
  }),
  z.object({
    op: z.literal('prepend'),
    text: z.string().describe('Text inserted at the very start of the note (include a trailing newline if needed).'),
  }),
])

export const kbEditSchema = {
  id: z.string().describe('Note id'),
  base_version: z.number().int().describe('Current version for optimistic lock'),
  edits: z
    .array(editOperation)
    .min(1)
    .describe(
      'Ordered edit operations applied to the note body. Prefer this over kb_update when changing part of a ' +
        'long note: send only the fragments to change instead of the whole body. Links, backlinks and version ' +
        'are recomputed from the resulting body automatically.',
    ),
}
