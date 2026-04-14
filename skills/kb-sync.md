---
name: kb-sync
description: Sync content from external sources — GitHub repos, websites, Notion, local directories — into the knowledge base
---

Pull and sync content from configured external sources into the omykb knowledge base.

## Usage

`/kb:sync` — sync all configured sources
`/kb:sync --source <name>` — sync a specific source
`/kb:sync --add` — add a new sync source interactively

## Supported Source Types

| Type | Description |
|------|-------------|
| `git` | GitHub / GitLab / Gitea repository |
| `web` | Website or documentation site (recursive crawl) |
| `notion` | Notion workspace (requires integration token) |
| `yuque` | 语雀 knowledge base |
| `local` | Local directory to watch and sync from |
| `rss` | RSS/Atom feed |

## Steps

### Adding a new source (`--add`)

1. Ask source type (from table above).
2. Ask source URL / path / connection details.
3. Ask which file types to include (default: `.md`, `.txt`, `.pdf`, `.html`).
4. Ask sync frequency or "manual only".
5. Append to `.omykb/config.json` under `sources`:
   ```json
   {
     "name": "<user-given name>",
     "type": "git|web|notion|yuque|local|rss",
     "url": "<url or path>",
     "include": ["*.md", "*.txt"],
     "exclude": ["node_modules/", "*.log"],
     "last_synced": null,
     "sync_interval": 3600
   }
   ```

### Syncing (`/kb:sync`)

For each source in `config.sources`:

1. **Git source**:
   - Check if already cloned in `.omykb/cache/<source-name>/`.
   - If not: `git clone --depth=1 <url> .omykb/cache/<name>` via Bash.
   - If yes: `git -C .omykb/cache/<name> pull` via Bash.
   - Find all matching files (respecting include/exclude patterns).
   - For each new/changed file: run the same extraction pipeline as `/kb:add`.
   - Track file hashes to detect changes (store in `.omykb/index.json`).

2. **Web source**:
   - Use WebFetch to retrieve the root URL.
   - Extract all internal links from the page.
   - Recursively fetch up to 50 pages (configurable depth).
   - Skip already-fetched URLs with identical content hash.
   - Store each page as a document.

3. **Notion source**:
   - Use WebFetch with Notion API (requires `NOTION_TOKEN` env var).
   - Fetch all pages from the specified workspace/database.
   - Convert Notion blocks to Markdown.
   - Store each page as a document.

4. **Local directory source**:
   - Use Glob to list all matching files in the source path.
   - Compare modification times against last sync time.
   - Process new/modified files through `/kb:add` pipeline.

5. **RSS source**:
   - Fetch feed URL with WebFetch.
   - Parse items (title, link, content, published date).
   - For each new item (since last sync): store as document.

After each source sync, update `last_synced` in config and print:
```
omykb> Sync: <source-name>
   New: <n> documents
   Updated: <n> documents
   Unchanged: <n> documents
   Errors: <n>
```

### Final summary

```
omykb> Sync complete
   Sources: <n> synced
   Total new: <n> docs
   Total updated: <n> docs
   Run `/kb:organize` to curate new content
```
