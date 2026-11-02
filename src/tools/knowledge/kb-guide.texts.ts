/**
 * Shared guide texts for the NoesisHub agent workflows.
 *
 * Single source of truth consumed by:
 * - kb-guide.tool.ts  (tool-based mirrors, for clients that only surface tools)
 * - kb.prompt.ts      (MCP prompts, for clients that support them)
 *
 * The wiki follows the Obsidian / Karpathy "LLM wiki" pattern at organizational
 * scale: each area has a curated **index** (Map of Content) as navigation entry
 * point and an append-only **log**; the agent maintains both. Access is governed
 * per area (read / write / manage).
 *
 * Navigation has a backbone: the index lists only the area's **main notes**
 * (kind: "main"), each of which is one main subject of the area. Every other note
 * declares a `parent` and hangs from one of them. This keeps the index a short map
 * of branches instead of a flat list that grows without bound, while leaving the
 * [[link]] graph itself completely free — any note may link to any other.
 */

export const INGEST_GUIDE = `You are ingesting a document into NoesisHub. The wiki is a **compiled knowledge base** — ingesting is not just indexing, it means reading, understanding, and **integrating** the source into the existing body of knowledge.

## 0. Orient yourself first (REQUIRED before creating anything)
- Call \`kb_home\`. It returns the areas you can access, your access level on each (\`read\` | \`write\` | \`manage\`), the slug of each area's **index** (Map of Content) and **log**, and its **main notes** — the area's main branches.
- You may **only create or update notes in areas where your access is \`write\` or \`manage\`**. The server rejects writes elsewhere.
- Pick the target area by matching the document's topic against each area's \`name\` / \`description\`. If **no** writable area clearly fits, **stop and ask the user** which area to use instead of guessing.
- Read the target area's index (\`kb_get\` on its index slug, default preview first) to see which main branches exist and how they are grouped.
- **First time in an area** (no main notes yet): call \`kb_list\`, look at what already exists, decide the area's main branches with the user, create them as \`kind: "main"\` and list them in the index **before** ingesting new content. This is the initial setup of the area.

## Language
- Write every note (title and body) in the **same language as the conversation** with the user, unless the user explicitly asks for another language.
- The only exceptions are structural markers that the system relies on (typed-edge prefixes like \`derived_from::\`, the \`## Sources\` heading, sensitivity keywords, log entry prefixes like \`INGEST:\`) — keep those verbatim.

## 1. Understand existing state
- The area index lists the **main notes**: pick the branch the document belongs to and \`kb_get\` it — a main note links to everything hanging from it.
- \`kb_list { parent: "<main-slug>" }\` gives you that branch's notes directly.
- Complement with \`kb_search\` on key concepts and \`kb_get\` previews on relevant matches.
- Use \`kb_get { mode: "full" }\` only for notes you will update or cite in detail.

## 2. The backbone: main notes (READ BEFORE CREATING)
This exists for one reason: to keep the connections clean and stop each area's index from growing without bound. It is a navigation layer, nothing more.

Every note has a \`kind\` and a \`parent\`:
- \`kind: "main"\` — a **main branch** of the area: one of its main subjects (a project, a process, a body of technical knowledge, the team…). Main notes are what the area index lists, and they are the only thing it lists.
- \`kind: "note"\` (default) — a regular note. It declares \`parent: "<main note title or slug>"\` and hangs from that branch.

**A main note is still an ordinary note.** It has a body, it is written, read, linked, cited, updated, moved and archived exactly like any other note. \`kind\` changes where it is *listed*, never what it *is* or what it may connect to.

Rules:
- **Before creating anything, decide which existing main note the content belongs to.** Default to attaching; the bar for a new branch is high.
- **Create a new main note only when the document opens a genuinely new subject of the area** that no existing branch covers. If in doubt, attach it to the closest branch and mention the alternative to the user.
- A main note's body is an **overview plus the map of its branch**: what the subject is, its current state, and \`[[links]]\` to the notes hanging from it. Keep it maintained as the branch grows — it plays for its branch the role the index plays for the area.
- **Every regular note must declare a \`parent\`.** A note with no parent is reachable from nothing: the server accepts it, but \`kb_lint\` reports it as an orphan. Never leave one behind on purpose.
- A main note may itself declare a \`parent\` to become a **sub-branch** of another main note. Only parent-less main notes are listed in the area index.
- \`parent\` must point at a note whose kind is \`main\` — the server rejects anything else, and rejects a parent that does not exist. Create the main note first, or ship both in the same \`kb_create_batch\` chunk (parents resolve within a chunk in any order).
- The \`parent\` field is **navigation only**. It does not restrict \`[[links]]\` in any way: any note may link to any note, in any branch or any area, main or not, exactly as before. Cross-branch links are normal and desirable — do not avoid a link because the two notes live under different mains.
- Promoting and demoting is cheap: \`kb_update { kind: "main" }\` when a note has clearly grown into a subject of its own, \`kb_update { kind: "note", parent: "…" }\` when a branch never grew. Nothing is lost either way.

## 3. Decomposition rules
- **One concept = one note.** Never dump the full document into a single note.
- Target **200–500 words** per note body. Split longer sections.
- Each note must have a **clear, unique title** (becomes the slug/identifier).
- Use markdown headings (## / ###) for internal structure.
- Set \`area\` to a writable area (from \`kb_home\`) that best fits the content.
- Set \`parent\` to the main note the concept belongs under (see §2).

## 4. Cross-referencing and typed edges
Use \`[[NoteTitle]]\` for wiki-links. Additionally, use **typed edge prefixes** to express the nature of the relationship:
- \`derived_from::[[Source]]\` — this note was extracted from another
- \`extends::[[BaseConcept]]\` — this note builds on or deepens another
- \`contradicts::[[OtherClaim]]\` — this note conflicts with another (explain the discrepancy)
- \`supersedes::[[OldPage]]\` — this note replaces outdated information
- \`related::[[Topic]]\` — general thematic connection

Typed edges are written inline in the body. The parser treats them as standard \`[[links]]\` for graph purposes, but the prefix conveys meaning to the reader and to future queries.

Notes may link across **areas of the same organization**. Readers without access to a linked note will see it as \`🔒 [restricted]\` — that is expected and handled by the server.

## 5. Source provenance
Every note created from an ingestion **must** end with a \`## Sources\` section listing where the information came from:
\`\`\`markdown
## Sources
- Document: "{original document title or filename}"
- Section: "{section or page reference if applicable}"
- Ingested: {current date}
\`\`\`

## 6. Integration with existing knowledge
This is the most critical step. Ingesting is not just creating new notes:
- If an existing note covers the same concept, **update it** with \`kb_update\` — merge the new information, add new sources, strengthen cross-references.
- If the new document **contradicts** an existing note, do NOT silently overwrite. Add a \`> ⚠️ Contradiction\` callout explaining the discrepancy, and add a \`contradicts::[[OtherNote]]\` edge.
- If the new document **extends** an existing note with deeper detail, update the existing note to reference the new detail note via \`extends::[[NewDetail]]\`.
- When creating two or more mutually linked notes, prefer \`kb_create_batch\` (maximum 25 notes per chunk). It prevalidates the chunk and resolves links **and \`parent\` references** among its notes regardless of input order — so a new main note ships together with everything hanging from it.
- After all atomic notes are created/updated, review nearby notes (via \`kb_links\`) and add cross-references where new connections now exist.

## 7. Summary note
- Create a summary note last, titled "{Document Title} — Summary", with \`parent\` set to the main note of the branch you ingested into.
- It should contain a brief overview and \`[[links]]\` to every note created or updated during this ingestion.
- Mark it with \`derived_from::"{original document}"\`.
- If the ingestion **opened a new branch**, the new main note already plays this role — do not create a second summary next to it.

## 8. Wire the new notes into the structure (REQUIRED)
A note no one can reach is invisible, whatever its content. Two levels, and you owe both:
- **Update the main note of the branch** you ingested into: add a \`[[link]]\` and a one-line summary for every note you created under it, and refresh its overview if the branch's state changed.
- **Update the area index** *only if you created a new top-level main note*. Add one line under the appropriate thematic \`##\` heading:
  \`- [[Main Note Title]] — one-line summary of the branch.\`
  Regular notes do **not** go in the index; they are reached through their main note.
- Leave pre-existing index entries alone unless you actually changed the note they point to. Areas that predate main notes still list notes directly — do not restructure them as a side effect of an ingestion. If reorganizing looks worthwhile, propose it to the user separately.

## 9. Append to the area log (REQUIRED)
Add one entry at the **bottom** of the area's log page (never rewrite previous entries):
\`- {YYYY-MM-DD} INGEST: "{document}" → created [[A]], [[B]] under [[Main Note]]; updated [[C]].\`

## 10. Sensitivity rules
- Default to \`public_org\` unless the content is sensitive.
- PII, credentials, strategic information → \`sensitivity: restricted\`.

## Workflow order
1. **Orient** — \`kb_home\` → read the target area's index and its main notes (set the branches up first if the area has none).
2. **Explore** — open the relevant main note, follow its links; complement with \`kb_search\`.
3. **Choose the branch** — which existing main note does this belong under? Open a new one only for a genuinely new subject of the area.
4. **Create atomic notes** — most specific concepts first, in a writable area, in the conversation language, each with its \`parent\`.
5. **Integrate** — update existing notes that overlap or relate.
6. **Cross-reference** — add typed edges between new and existing notes.
7. **Summary note** — under the branch's main note.
8. **Wire it up** — link the new notes from their main note; add the index line only if you created a new main note.
9. **Append to the log** — one INGEST entry.`

export const QUERY_GUIDE = `Answer this question using NoesisHub: "\${question}"

NoesisHub is a **compiled wiki** — knowledge has already been decomposed, cross-referenced, and integrated from source documents. You are querying pre-compiled knowledge, not raw documents. Navigation is **index-first**: each area has a curated index (Map of Content) that lists its **main notes** — the area's main branches — and every other note hangs from one of them.

## Scope & language
- Call \`kb_home\` if you haven't: it lists the areas you can read, the slug of each area's index, and its main notes. Answers can only draw on notes in those areas.
- Respond in the **same language as the conversation** with the user, unless they ask otherwise, even if the underlying notes are written in another language (translate the synthesis, but keep cited titles verbatim).

## Strategy (index-first, search as shortcut)
1. \`kb_home\` → identify the area(s) most relevant to the question, and which of its **main notes** covers the subject.
2. \`kb_get\` the area's index in preview mode and scan its one-line entries for the relevant branch.
3. \`kb_get\` that branch's **main note**: it gives you the overview plus the map of everything under it. \`kb_list { parent: "<main-slug>" }\` enumerates the branch if the main note's map looks incomplete.
4. \`kb_get\` previews for at most 1-3 promising notes. If a note is long, pass \`heading\` to read only the relevant section. Use \`mode: "full"\` only when the answer requires exact full-note context. Follow the **typed edges** to expand context:
   - \`extends::\` and \`related::\` links often contain deeper detail.
   - \`contradicts::\` links reveal conflicting information you must surface.
   - \`derived_from::\` links trace back to source provenance.
5. \`kb_links\` (dir: "both") on the most relevant notes to discover connections the text might not mention explicitly. Links cross branches and areas freely — do not assume a branch is a silo.
6. **Only if the index does not cover the topic**, fall back to \`kb_search\` with 2–3 key terms. A hit with no \`parent\` is an unfiled note: usable, but flag it as loose knowledge.

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
- **Offer the user** to save it as a new note (\`derived_from::\` edges to the notes used), under the main note whose branch it belongs to.
- On save: link it from that main note and append a \`NOTE:\` entry to the log. The area index only changes if you opened a new main branch.
Good answers filed back make the wiki compound over time.`

export const LINT_GUIDE = `Run a structural health check on the NoesisHub wiki. Report issues and optionally fix them.

## Scope & language
- Call \`kb_home\` first: you can only audit areas you can read, and fixes that create/update notes require \`write\` or \`manage\` access on the area.
- Write the report and any note edits in the **same language as the conversation**, unless the user asks otherwise (keep typed-edge prefixes and structural headings verbatim).

## Checks to perform

### 1. Unattached notes (most important)
- \`kb_list { area, orphans: true }\` returns every note with no \`parent\` — the notes that hang from no main branch.
- A regular note with no parent is **unattached**: reachable only by search, invisible to navigation. List them all with a suggested main note to attach each to.
- Main notes with no parent are **not** a problem: those are the area's top-level branches, by design.
- Notes created before the area adopted main notes will show up here in bulk. Say so in the report and propose attaching them branch by branch — do not silently re-file dozens of notes.

### 2. Broken branches
- \`kb_list { area }\` returns each note's \`parent\`; \`kb_list { area, kind: "main" }\` returns the live main notes.
- Any \`parent\` value that is not in that second list is a **broken branch**: the main was archived or demoted, and its children now hang from something that no longer leads anywhere. Group the affected notes by that dead parent.
- This is not blocked at write time on purpose — archiving a main behaves like archiving any note, and its children keep pointing at its slug so **recreating it under the same name restores the whole branch**. Check whether that is the intent before re-filing anything.

### 3. Branch integrity
- \`kb_list { area, kind: "main" }\` lists the area's main notes.
- Every top-level main note must have a line in the area index; flag the ones missing from it.
- Every main note's body must \`[[link]]\` the notes hanging from it: compare against \`kb_list { parent: "<main-slug>" }\` and flag the children it does not mention.
- Flag main notes with **no** children and no substantive body — a branch that never grew is usually a note that should be demoted with \`kb_update { kind: "note" }\` and attached elsewhere.
- Flag the opposite too: a branch so large that its main note has become an article rather than a map is a candidate for splitting into sub-branches.

### 4. Orphan detection
- For each note, call \`kb_links\` (dir: "both").
- An **orphan** is a note with zero incoming links that is not a summary/index/log page. List all orphans. This is about the \`[[link]]\` graph and is independent of \`parent\`: a note can be correctly attached to a branch and still be linked by nobody.

### 5. Broken / dangling links
- Notes may contain \`[[links]]\` to pages that don't exist yet (stored in \`unresolved\` field).
- Call \`kb_get\` on notes and check for unresolved entries.
- List all dangling links with the source note and the missing target.

### 6. Missing source provenance
- Every note created from ingestion should have a \`## Sources\` section.
- Flag notes that lack one.

### 7. Contradiction audit
- Look for notes containing \`contradicts::\` typed edges.
- For each pair, read both notes and verify the contradiction is still documented and clear.
- Flag stale contradictions (where one side has been updated but the edge remains).

### 8. Cross-reference density
- Notes with many outgoing links but few incoming links may be under-connected.
- Notes that cover similar topics (search overlapping terms) but don't link to each other are candidates for new cross-references.

### 9. Link sensitivity audit
- Flag notes that link to a **more restricted** target (e.g. a \`public_org\` note linking to a \`confidential\` one): readers without access see \`🔒 [restricted]\` holes.
- Sometimes intentional — confirm with the user before "fixing".

## Output format
Produce a structured report:
\`\`\`
## Wiki Health Report — {area}

### Unattached notes (X found)
- [[NoteTitle]] — no parent; suggested branch: [[Main Note]]

### Broken branches (X found)
- "dead-main-slug" — no longer a live main note; [[Child A]], [[Child B]] hang from it

### Branch integrity (X issues)
- [[Main Note]] — not listed in the area index
- [[Main Note]] — does not link [[Child A]], [[Child B]]
- [[Main Note]] — empty branch, candidate for demotion

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
- **Unattached notes**: \`kb_update { parent: "<main note>" }\`, and add the note's line to that main note's map. Confirm the branch with the user when the note could plausibly go under more than one.
- **Broken branches**: ask first whether the main should come back. If yes, recreate it under the **same slug** — every child reattaches on its own. If no, \`kb_update { parent: "<live main>" }\` on each child.
- **Branch integrity**: add the missing index line for a top-level main note; add the missing \`[[links]]\` to the main note's map; demote an empty branch with \`kb_update { kind: "note", parent: "<other main>" }\` and remove its index line.
- **Orphans**: Add links from the most relevant related notes, or from the branch's main note.
- **Dangling links**: Create stub notes for missing targets, or correct the link spelling.
- **Missing provenance**: If the source is unknown, add \`## Sources\\n- Provenance unknown — pre-existing note\`.
- **Weak cross-references**: Add \`related::[[Target]]\` edges in both directions.
- **Sensitivity leaks**: Either raise the source note's sensitivity, remove the link, or confirm it is intentional.

## Log the pass
Append one entry to the area's log page:
\`- {YYYY-MM-DD} LINT: {X} issues found, {Y} fixed.\``
