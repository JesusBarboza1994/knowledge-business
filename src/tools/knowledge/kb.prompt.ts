import { Injectable } from '@nestjs/common'
import { z } from 'zod'
import { McpPrompt, PromptDefinition } from '../prompt.interface'
import { UserProfile } from '../user-profile.type'

@Injectable()
export class KbPrompt implements McpPrompt {
  definitions(_user: UserProfile): PromptDefinition[] {
    return [
      {
        name: 'kb_ingest',
        description:
          'Instructions for ingesting a document into the Knowledge Hub — decompose, integrate with existing knowledge, and cross-reference.',
        handler: async () => ({
          messages: [
            {
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text: `You are ingesting a document into the Knowledge Hub. The wiki is a **compiled knowledge base** — ingesting is not just indexing, it means reading, understanding, and **integrating** the source into the existing body of knowledge.

## 1. Understand existing state
- Call \`kb_list\` to see all current notes.
- Call \`kb_search\` with key concepts from the document to find notes that already cover related topics.
- Call \`kb_get\` on relevant matches to understand what the wiki already knows.

## 2. Decomposition rules
- **One concept = one note.** Never dump the full document into a single note.
- Target **200–500 words** per note body. Split longer sections.
- Each note must have a **clear, unique title** (becomes the slug/identifier).
- Use markdown headings (## / ###) for internal structure.
- Set \`area\` to the knowledge area that best fits the content.

## 3. Cross-referencing and typed edges
Use \`[[NoteTitle]]\` for wiki-links. Additionally, use **typed edge prefixes** to express the nature of the relationship:
- \`derived_from::[[Source]]\` — this note was extracted from another
- \`extends::[[BaseConcept]]\` — this note builds on or deepens another
- \`contradicts::[[OtherClaim]]\` — this note conflicts with another (explain the discrepancy)
- \`supersedes::[[OldPage]]\` — this note replaces outdated information
- \`related::[[Topic]]\` — general thematic connection

Typed edges are written inline in the body. The parser treats them as standard \`[[links]]\` for graph purposes, but the prefix conveys meaning to the reader and to future queries.

## 4. Source provenance
Every note created from an ingestion **must** end with a \`## Sources\` section listing where the information came from:
\`\`\`markdown
## Sources
- Document: "{original document title or filename}"
- Section: "{section or page reference if applicable}"
- Ingested: {current date}
\`\`\`

## 5. Integration with existing knowledge
This is the most critical step. Ingesting is not just creating new notes:
- If an existing note covers the same concept, **update it** with \`kb_update\` — merge the new information, add new sources, strengthen cross-references.
- If the new document **contradicts** an existing note, do NOT silently overwrite. Add a \`> ⚠️ Contradiction\` callout explaining the discrepancy, and add a \`contradicts::[[OtherNote]]\` edge.
- If the new document **extends** an existing note with deeper detail, update the existing note to reference the new detail note via \`extends::[[NewDetail]]\`.
- After all atomic notes are created/updated, review nearby notes (via \`kb_links\`) and add cross-references where new connections now exist.

## 6. Summary / Index note
- Create a summary note last, titled "{Document Title} — Summary".
- It should contain a brief overview and \`[[links]]\` to every note created or updated during this ingestion.
- Mark it with \`derived_from::"{original document}"\`.

## 7. Sensitivity rules
- Default to \`public_org\` unless the content is sensitive.
- PII, credentials, strategic information → \`sensitivity: restricted\`.

## Workflow order
1. **Explore** — \`kb_list\` + \`kb_search\` to understand current state.
2. **Create atomic notes** — most specific concepts first.
3. **Integrate** — update existing notes that overlap or relate.
4. **Cross-reference** — add typed edges between new and existing notes.
5. **Summary note** — create the index note linking everything.`,
              },
            },
          ],
        }),
      },
      {
        name: 'kb_query',
        description:
          'Strategy for answering a question from the compiled Knowledge Hub wiki.',
        argsSchema: { question: z.string().describe('The question to answer') },
        handler: async ({ question }) => ({
          messages: [
            {
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text: `Answer this question using the Knowledge Hub: "${question}"

The Knowledge Hub is a **compiled wiki** — knowledge has already been decomposed, cross-referenced, and integrated from source documents. You are querying pre-compiled knowledge, not raw documents.

## Strategy
1. Call \`kb_search\` with 2–3 key terms extracted from the question.
2. For the top 3–5 results, call \`kb_get\` to read the full compiled note.
3. Follow the **typed edges** in each note to expand context:
   - \`extends::\` and \`related::\` links often contain deeper detail.
   - \`contradicts::\` links reveal conflicting information you must surface.
   - \`derived_from::\` links trace back to source provenance.
4. Call \`kb_links\` (dir: "both") on the most relevant notes to discover connections the text might not mention explicitly.
5. Read any linked notes that appear relevant.

## Answer rules
- Synthesise a clear, concise answer from the compiled notes.
- **Cite note titles** when attributing facts: "According to [[NoteTitle]]…"
- If notes **contradict** each other, surface both positions and note the discrepancy.
- Never invent information not present in the wiki.
- If the wiki has no relevant notes, say so explicitly — do not guess.
- Check the \`## Sources\` section of notes to provide provenance when useful.`,
              },
            },
          ],
        }),
      },
      {
        name: 'kb_lint',
        description:
          'Health check for the Knowledge Hub wiki — find orphans, broken links, missing provenance, and contradictions.',
        handler: async () => ({
          messages: [
            {
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text: `Run a structural health check on the Knowledge Hub wiki. Report issues and optionally fix them.

## Checks to perform

### 1. Orphan detection
- Call \`kb_list\` to get all notes.
- For each note, call \`kb_links\` (dir: "both").
- An **orphan** is a note with zero incoming links and that is not a summary/index note. List all orphans.

### 2. Broken / dangling links
- Notes may contain \`[[links]]\` to pages that don't exist yet (stored in \`unresolved\` field).
- Call \`kb_get\` on notes and check for unresolved entries.
- List all dangling links with the source note and the missing target.

### 3. Missing source provenance
- Every note created from ingestion should have a \`## Sources\` section.
- Call \`kb_get\` on a sample of notes (or all if the wiki is small).
- Flag notes that lack a \`## Sources\` section.

### 4. Contradiction audit
- Look for notes containing \`contradicts::\` typed edges.
- For each pair, read both notes and verify the contradiction is still documented and clear.
- Flag stale contradictions (where one side has been updated but the edge remains).

### 5. Cross-reference density
- Notes with many outgoing links but few incoming links may be under-connected.
- Notes that cover similar topics (search overlapping terms) but don't link to each other are candidates for new cross-references.

## Output format
Produce a structured report:
\`\`\`
## Wiki Health Report

### Orphans (X found)
- [[NoteTitle]] — no incoming links

### Dangling Links (X found)
- [[SourceNote]] → [[MissingTarget]]

### Missing Provenance (X found)
- [[NoteTitle]] — no ## Sources section

### Contradictions (X active)
- [[NoteA]] contradicts [[NoteB]] — {summary}

### Cross-reference suggestions
- [[NoteA]] and [[NoteB]] cover overlapping topics but don't link to each other
\`\`\`

## Fixing
After presenting the report, ask the user which issues to fix. For each fix:
- **Orphans**: Add links from the most relevant related notes, or from a topic index.
- **Dangling links**: Create stub notes for missing targets, or correct the link spelling.
- **Missing provenance**: If the source is unknown, add \`## Sources\\n- Provenance unknown — pre-existing note\`.
- **Weak cross-references**: Add \`related::[[Target]]\` edges in both directions.`,
              },
            },
          ],
        }),
      },
    ]
  }
}
