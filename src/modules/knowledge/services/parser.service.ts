import { Injectable } from '@nestjs/common'

export interface ParsedHeading {
  id: string
  text: string
  level: number
}

export interface ParsedBlock {
  id: string
  text: string
}

export interface ParsedLink {
  display: string
  name: string
  anchor: string | null
  source_heading: string
  source_block: string
}

export interface ParsedBody {
  headings: ParsedHeading[]
  blocks: ParsedBlock[]
  links: ParsedLink[]
}

@Injectable()
export class ParserService {
  parse(body: string): ParsedBody {
    const lines = body.split('\n')
    const headings: ParsedHeading[] = []
    const blocks: ParsedBlock[] = []
    const links: ParsedLink[] = []

    let currentHeading = ''
    let blockIndex = 0

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/)
      if (headingMatch) {
        const level = headingMatch[1].length
        const text = headingMatch[2].trim()
        const id = `h_${text.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
        headings.push({ id, text, level })
        currentHeading = text
        links.push(...this.linksIn(text, text, id))
        continue
      }

      const trimmed = line.trim()
      if (trimmed.length === 0) continue

      const blockId = `b_${String(blockIndex++).padStart(2, '0')}`
      blocks.push({ id: blockId, text: trimmed })
      links.push(...this.linksIn(trimmed, currentHeading, blockId))
    }

    return { headings, blocks, links }
  }

  private linksIn(text: string, sourceHeading: string, sourceBlock: string): ParsedLink[] {
    return [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((match) => {
      const raw = match[1]
      const [namePart, anchor] = raw.split('#')
      return {
        display: raw,
        name: namePart
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9áéíóúüñ]+/g, '-')
          .replace(/^-+|-+$/g, ''),
        anchor: anchor?.trim() ?? null,
        source_heading: sourceHeading,
        source_block: sourceBlock,
      }
    })
  }
}
