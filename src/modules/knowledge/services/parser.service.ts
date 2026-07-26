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

export interface ParsedAsset {
  id: string
  source_block: string
}

export interface ParsedBody {
  headings: ParsedHeading[]
  blocks: ParsedBlock[]
  links: ParsedLink[]
  assets: ParsedAsset[]
}

/** Matches the image embed a note body uses for an asset: ![alt](kb:asset/<id>). */
const ASSET_EMBED = /!\[[^\]]*\]\(\s*kb:asset\/([a-f0-9]{24})/gi

@Injectable()
export class ParserService {
  parse(body: string): ParsedBody {
    const lines = body.split('\n')
    const headings: ParsedHeading[] = []
    const blocks: ParsedBlock[] = []
    const links: ParsedLink[] = []
    const assets: ParsedAsset[] = []

    let currentHeading = ''
    let blockIndex = 0
    let fence: string | null = null

    const pushBlock = (text: string) => {
      const id = `b_${String(blockIndex++).padStart(2, '0')}`
      blocks.push({ id, text })
      return id
    }

    for (const line of lines) {
      const trimmedLine = line.trim()
      const delimiter = line.match(/^\s*(`{3,}|~{3,})/)?.[1][0]

      // A fence opens with ``` or ~~~ and only closes with the same character.
      if (delimiter && (fence === null || fence === delimiter)) {
        fence = fence === null ? delimiter : null
        pushBlock(trimmedLine)
        continue
      }

      // Inside a fenced block nothing is markdown: no headings, no connections.
      if (fence) {
        if (trimmedLine) pushBlock(trimmedLine)
        continue
      }

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

      if (trimmedLine.length === 0) continue

      const blockId = pushBlock(trimmedLine)
      links.push(...this.linksIn(trimmedLine, currentHeading, blockId))
      assets.push(...this.assetsIn(trimmedLine, blockId))
    }

    return { headings, blocks, links, assets }
  }

  /**
   * Inline code is documentation, not a connection: a `[[Example]]` shown inside backticks —
   * as the area index template does — must not become a real edge to a note that never existed.
   */
  private withoutCodeSpans(text: string): string {
    return text.replace(/(`+)(?:(?!\1)[\s\S])*?\1/g, ' ')
  }

  /**
   * Which assets a line actually shows. Shares the code-span guard with links: a `kb:asset/...`
   * quoted inside backticks is documentation, and counting it as a use would keep an image alive
   * forever — or drag a note's sensitivity onto an asset it never really displayed.
   */
  private assetsIn(text: string, sourceBlock: string): ParsedAsset[] {
    return [...this.withoutCodeSpans(text).matchAll(ASSET_EMBED)].map((match) => ({
      id: match[1].toLowerCase(),
      source_block: sourceBlock,
    }))
  }

  private linksIn(text: string, sourceHeading: string, sourceBlock: string): ParsedLink[] {
    return [...this.withoutCodeSpans(text).matchAll(/\[\[([^\]]+)\]\]/g)].map((match) => {
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
