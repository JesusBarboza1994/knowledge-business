/**
 * Shared guide texts for the Knowledge Hub agent workflows.
 *
 * Single source of truth consumed by:
 * - kb-guide.tool.ts  (tool-based mirrors, for clients that only surface tools)
 * - kb.prompt.ts      (MCP prompts, for clients that support them)
 *
 * The wiki follows the Obsidian / Karpathy "LLM wiki" pattern at organizational
 * scale: each area has a curated **index** (Map of Content) as navigation entry
 * point and an append-only **log**; the agent maintains both. Access is governed
 * per area (read / write / manage).
 */

export const INGEST_GUIDE = `You are ingesting a document into the Knowledge Hub. The wiki is a **compiled knowledge base** — ingesting is not just indexing, it means reading, understanding, and **integrating** the source into the existing body of knowledge.

## 0. Orient yourself first (REQUIRED before creating anything)
- Call \`kb_home\`. It returns the areas you can access, your access level on each (\`read\` | \`write\` | \`manage\`), and the slug of each area's **index** (Map of Content) and **log**.
- You may **only create or update notes in areas where your access is \`write\` or \`manage\`**. The server rejects writes elsewhere.
- Pick the target area by matching the document's topic against each area's \`name\` / \`description\`. If **no** writable area clearly fits, **stop and ask the user** which area to use instead of guessing.
- Read the target area's index (\`kb_get\` on its index slug, default preview first) to understand how knowledge is currently organized there.
- **First time in an area** (the index has no entries yet): call \`kb_list\`, populate the index with the existing notes (one line each, grouped by theme) **before** ingesting new content. This is the initial setup of the area.

## Language
- Write every note (title and body) in the **same language as the conversation** with the user, unless the user explicitly asks for another language.
- The only exceptions are structural markers that the system relies on (typed-edge prefixes like \`derived_from::\`, the \`## Sources\` heading, sensitivity keywords, log entry prefixes like \`INGEST:\`) — keep those verbatim.

## 1. Understand existing state
- The area index is your map: follow its \`[[links]]\` to notes related to the document's topics.
- Complement with \`kb_search\` on key concepts and \`kb_get\` previews on relevant matches.
- Use \`kb_get { mode: "full" }\` only for notes you will update or cite in detail.

## 2. Decomposition rules
- **One concept = one note.** Never dump the full document into a single note.
- Target **200–500 words** per note body. Split longer sections.
- Each note must have a **clear, unique title** (becomes the slug/identifier).
- Use markdown headings (## / ###) for internal structure.
- Set \`area\` to a writable area (from \`kb_home\`) that best fits the content.

## 3. Cross-referencing and typed edges
Use \`[[NoteTitle]]\` for wiki-links. Additionally, use **typed edge prefixes** to express the nature of the relationship:
- \`derived_from::[[Source]]\` — this note was extracted from another
- \`extends::[[BaseConcept]]\` — this note builds on or deepens another
- \`contradicts::[[OtherClaim]]\` — this note conflicts with another (explain the discrepancy)
- \`supersedes::[[OldPage]]\` — this note replaces outdated information
- \`related::[[Topic]]\` — general thematic connection

Typed edges are written inline in the body. The parser treats them as standard \`[[links]]\` for graph purposes, but the prefix conveys meaning to the reader and to future queries.

Notes may link across **areas of the same organization**. Readers without access to a linked note will see it as \`🔒 [restricted]\` — that is expected and handled by the server.

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

## 7. Update the area index (REQUIRED)
The index is the area's Map of Content — a note that is not reachable from it is invisible to navigation.
- Add **every note you created** under the appropriate thematic \`##\` heading, one line each:
  \`- [[Note Title]] — one-line summary of what it contains.\`
- Update the one-line summary of notes you significantly changed.
- Create or rename headings if the area's topics evolved.

## 8. Append to the area log (REQUIRED)
Add one entry at the **bottom** of the area's log page (never rewrite previous entries):
\`- {YYYY-MM-DD} INGEST: "{document}" → created [[A]], [[B]]; updated [[C]].\`

## 9. Sensitivity rules
- Default to \`public_org\` unless the content is sensitive.
- PII, credentials, strategic information → \`sensitivity: restricted\`.

## Workflow order
1. **Orient** — \`kb_home\` → read the target area's index (populate it first if empty).
2. **Explore** — follow index links; complement with \`kb_search\`.
3. **Create atomic notes** — most specific concepts first, in a writable area, in the conversation language.
4. **Integrate** — update existing notes that overlap or relate.
5. **Cross-reference** — add typed edges between new and existing notes.
6. **Summary note** — create the index note linking everything.
7. **Update the area index** — every new note gets its one-line entry.
8. **Append to the log** — one INGEST entry.`

export const QUERY_GUIDE = `Answer this question using the Knowledge Hub: "\${question}"

The Knowledge Hub is a **compiled wiki** — knowledge has already been decomposed, cross-referenced, and integrated from source documents. You are querying pre-compiled knowledge, not raw documents. Navigation is **index-first**: each area has a curated index (Map of Content) that is the entry point.

## Scope & language
- Call \`kb_home\` if you haven't: it lists the areas you can read and the slug of each area's index. Answers can only draw on notes in those areas.
- Respond in the **same language as the conversation** with the user, unless they ask otherwise, even if the underlying notes are written in another language (translate the synthesis, but keep cited titles verbatim).

## Strategy (index-first, search as shortcut)
1. \`kb_home\` → identify the area(s) most relevant to the question.
2. \`kb_get\` the area's index in preview mode and scan its one-line entries for relevant notes.
3. \`kb_get\` previews for at most 1-3 promising notes. If a note is long, pass \`heading\` to read only the relevant section. Use \`mode: "full"\` only when the answer requires exact full-note context. Follow the **typed edges** to expand context:
   - \`extends::\` and \`related::\` links often contain deeper detail.
   - \`contradicts::\` links reveal conflicting information you must surface.
   - \`derived_from::\` links trace back to source provenance.
4. \`kb_links\` (dir: "both") on the most relevant notes to discover connections the text might not mention explicitly.
5. **Only if the index does not cover the topic**, fall back to \`kb_search\` with 2–3 key terms.

## Answer rules
- Synthesise a clear, concise answer from the compiled notes.
- **Cite note titles** when attributing facts: "According to [[NoteTitle]]…"
- If notes **contradict** each other, surface both positions and note the discrepancy.
- Never invent information not present in the wiki.
- If the wiki has no relevant notes, say so explicitly — do not guess.
- \`🔒 [restricted]\` markers are links to notes outside your access — acknowledge the gap if relevant, do not speculate about their content.
- Check the \`## Sources\` section of notes to provide provenance when useful.

## File the answer back (compounding loop)
If your synthesis produced knowledge that is **not yet written in any single note** — a cross-note comparison, a resolved ambiguity, a summary that connects areas — and you have write access:
- **Offer the user** to save it as a new note (\`derived_from::\` edges to the notes used).
- On save: add it to the area index and append a \`NOTE:\` entry to the log.
Good answers filed back make the wiki compound over time.`

export const LINT_GUIDE = `Run a structural health check on the Knowledge Hub wiki. Report issues and optionally fix them.

## Scope & language
- Call \`kb_home\` first: you can only audit areas you can read, and fixes that create/update notes require \`write\` or \`manage\` access on the area.
- Write the report and any note edits in the **same language as the conversation**, unless the user asks otherwise (keep typed-edge prefixes and structural headings verbatim).

## Checks to perform

### 1. Index reachability (most important)
- \`kb_get\` the area's index and collect every \`[[link]]\` in it.
- \`kb_list\` all notes in the area.
- A note that is not reachable from the index (directly, or through notes the index links to) is **unmapped** — invisible to navigation. Index and log pages themselves are exempt.

### 2. Orphan detection
- For each note, call \`kb_links\` (dir: "both").
- An **orphan** is a note with zero incoming links that is not a summary/index/log page. List all orphans.

### 3. Broken / dangling links
- Notes may contain \`[[links]]\` to pages that don't exist yet (stored in \`unresolved\` field).
- Call \`kb_get\` on notes and check for unresolved entries.
- List all dangling links with the source note and the missing target.

### 4. Missing source provenance
- Every note created from ingestion should have a \`## Sources\` section.
- Flag notes that lack one.

### 5. Contradiction audit
- Look for notes containing \`contradicts::\` typed edges.
- For each pair, read both notes and verify the contradiction is still documented and clear.
- Flag stale contradictions (where one side has been updated but the edge remains).

### 6. Cross-reference density
- Notes with many outgoing links but few incoming links may be under-connected.
- Notes that cover similar topics (search overlapping terms) but don't link to each other are candidates for new cross-references.

### 7. Link sensitivity audit
- Flag notes that link to a **more restricted** target (e.g. a \`public_org\` note linking to a \`confidential\` one): readers without access see \`🔒 [restricted]\` holes.
- Sometimes intentional — confirm with the user before "fixing".

## Output format
Produce a structured report:
\`\`\`
## Wiki Health Report — {area}

### Unmapped notes (X found)
- [[NoteTitle]] — not reachable from the index

### Orphans (X found)
- [[NoteTitle]] — no incoming links

### Dangling Links (X found)
- [[SourceNote]] → [[MissingTarget]]

### Missing Provenance (X found)
- [[NoteTitle]] — no ## Sources section

### Contradictions (X active)
- [[NoteA]] contradicts [[NoteB]] — {summary}

### Sensitivity leaks (X found)
- [[PublicNote]] (public_org) → [[SecretNote]] (confidential)

### Cross-reference suggestions
- [[NoteA]] and [[NoteB]] cover overlapping topics but don't link to each other
\`\`\`

## Fixing
After presenting the report, ask the user which issues to fix. For each fix:
- **Unmapped notes**: Add a one-line entry to the area index under the right heading.
- **Orphans**: Add links from the most relevant related notes, or from a topic index.
- **Dangling links**: Create stub notes for missing targets, or correct the link spelling.
- **Missing provenance**: If the source is unknown, add \`## Sources\\n- Provenance unknown — pre-existing note\`.
- **Weak cross-references**: Add \`related::[[Target]]\` edges in both directions.
- **Sensitivity leaks**: Either raise the source note's sensitivity, remove the link, or confirm it is intentional.

## Log the pass
Append one entry to the area's log page:
\`- {YYYY-MM-DD} LINT: {X} issues found, {Y} fixed.\``
