export interface UnlinkedBody {
  body: string
  removedLinks: number
}

function normalizeReference(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúüñ]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function unlinkWikiReferences(body: string, references: Iterable<string>): UnlinkedBody {
  const normalized = new Set([...references].map(normalizeReference))
  let removedLinks = 0
  const nextBody = body.replace(/\[\[([^\]]+)\]\]/g, (full, inner: string) => {
    const [name] = inner.split('#')
    if (!normalized.has(normalizeReference(name))) return full
    removedLinks += 1
    return name.trim()
  })
  return { body: nextBody, removedLinks }
}
