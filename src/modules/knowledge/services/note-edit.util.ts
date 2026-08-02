import { BadRequestException } from '@nestjs/common'

/**
 * A single surgical edit against a note body. Applied in order, each against the result of the
 * previous one, so later operations see the text produced by earlier ones. All matching is literal
 * (no regex): `find`/`anchor` are compared as exact substrings.
 */
export type EditOperation =
  | { op: 'replace'; find: string; replacement: string; all?: boolean }
  | { op: 'delete'; find: string; all?: boolean }
  | { op: 'insert_after'; anchor: string; text: string }
  | { op: 'insert_before'; anchor: string; text: string }
  | { op: 'append'; text: string }
  | { op: 'prepend'; text: string }

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

/** Truncated preview of an anchor/find string, so error messages stay readable. */
function preview(value: string): string {
  const oneLine = value.replace(/\s+/g, ' ').trim()
  return oneLine.length > 60 ? `${oneLine.slice(0, 60)}…` : oneLine
}

/**
 * Resolves a match that must be unique: fails loudly on 0 (nothing to edit) or >1 (ambiguous — the
 * caller must disambiguate with more surrounding context, or opt into `all`). This is what keeps a
 * blind edit from silently hitting the wrong occurrence.
 */
function requireUnique(body: string, needle: string, index: number, label: string): void {
  const matches = countOccurrences(body, needle)
  if (matches === 0) throw new BadRequestException(`edit[${index}]: ${label} not found: "${preview(needle)}"`)
  if (matches > 1) {
    throw new BadRequestException(
      `edit[${index}]: ${label} is ambiguous — ${matches} occurrences of "${preview(needle)}". ` +
        `Add surrounding context to make it unique, or pass all: true.`,
    )
  }
}

function applyOne(body: string, edit: EditOperation, index: number): string {
  switch (edit.op) {
    case 'replace': {
      if (edit.all) {
        if (countOccurrences(body, edit.find) === 0) {
          throw new BadRequestException(`edit[${index}]: find not found: "${preview(edit.find)}"`)
        }
        return body.split(edit.find).join(edit.replacement)
      }
      requireUnique(body, edit.find, index, 'find')
      return body.replace(edit.find, edit.replacement)
    }
    case 'delete': {
      if (edit.all) {
        if (countOccurrences(body, edit.find) === 0) {
          throw new BadRequestException(`edit[${index}]: find not found: "${preview(edit.find)}"`)
        }
        return body.split(edit.find).join('')
      }
      requireUnique(body, edit.find, index, 'find')
      return body.replace(edit.find, '')
    }
    case 'insert_after': {
      requireUnique(body, edit.anchor, index, 'anchor')
      const at = body.indexOf(edit.anchor) + edit.anchor.length
      return body.slice(0, at) + edit.text + body.slice(at)
    }
    case 'insert_before': {
      requireUnique(body, edit.anchor, index, 'anchor')
      const at = body.indexOf(edit.anchor)
      return body.slice(0, at) + edit.text + body.slice(at)
    }
    case 'append':
      return body + edit.text
    case 'prepend':
      return edit.text + body
  }
}

/**
 * Applies an ordered list of edits to a note body and returns the new body. Pure: it never mutates
 * its input and performs no I/O — the caller feeds the result back through the normal update path so
 * links, versioning and asset usage are recomputed exactly as for a full-body edit.
 */
export function applyEdits(body: string, edits: EditOperation[]): string {
  return edits.reduce((current, edit, index) => applyOne(current, edit, index), body)
}
