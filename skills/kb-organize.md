---
name: kb-organize
description: AI-powered knowledge base curator — auto-tag, restructure, merge duplicates, and improve metadata
---

Run the OMYKB AI curator to organize, clean up, and improve the structure of your knowledge base. Inspired by the "知识库管家" pattern.

## Usage

`/kb:organize` — analyze and reorganize the full KB
`/kb:organize --dry-run` — preview changes without applying them
`/kb:organize --topic <topic>` — organize only documents related to a topic

## Steps

1. Read `.omykb/config.json` and `.omykb/index.json`.

2. **Audit phase** — scan all documents:
   - Use Glob to list all `.md` files in `config.storage.path`.
   - Read each document's frontmatter and first 500 chars.
   - Build a manifest: title, tags, word count, date, summary snippet.

3. **Analysis phase** — identify issues:
   - **Missing tags**: documents with empty `tags: []` frontmatter.
   - **Poor titles**: documents with generic titles like "Untitled" or file-name-based titles.
   - **Duplicates**: documents with >80% title similarity or identical content in first 200 chars.
   - **Orphaned docs**: documents not referenced by any other document.
   - **Topic clusters**: group documents by common keywords to identify emerging topics.
   - **Directory chaos**: files that don't fit logical grouping.

4. **Generate reorganization plan**:
   ```
   OMYKB> Curator Analysis
   
   📊 KB Stats: <n> docs · <n> topics detected · <n> issues found
   
   Issues:
   ⚠️  <n> documents missing tags
   ⚠️  <n> potential duplicates
   ⚠️  <n> documents with generic titles
   
   Proposed Actions:
   1. Add tags to <n> documents
   2. Rename <n> documents
   3. Merge <n> duplicate pairs
   4. Create topic index files for: <topic1>, <topic2>...
   5. Move <n> files to suggested directories
   ```

5. **If not `--dry-run`**, ask user to confirm each action category, then apply:
   - **Tag documents**: Read each untagged doc, infer 3-5 tags from content, update frontmatter.
   - **Rename documents**: Generate better title from content summary, rename file and update frontmatter.
   - **Flag duplicates**: Show both docs side by side, ask user to keep/merge/delete.
   - **Create topic indexes**: Generate `_index_<topic>.md` with links to related documents.
   - **Move files**: Suggest `<topic>/` subdirectory organization, show proposed moves.

6. **Generate aggregate Markdown** for each detected topic cluster:
   ```markdown
   ---
   title: "Knowledge Digest: <Topic>"
   type: aggregate
   generated_at: <timestamp>
   sources: [doc1.md, doc2.md, ...]
   ---
   # <Topic>
   
   <AI-synthesized summary of all docs in this topic cluster>
   
   ## Key Concepts
   ...
   
   ## Source Documents
   - [Doc Title](./path.md)
   ```

7. Update `.omykb/index.json` with all changes.

8. Print final report: actions taken, files modified, aggregates created.
