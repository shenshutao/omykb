---
name: kb-status
description: Show knowledge base statistics, health, storage usage, and recent activity
---

Display a comprehensive status report for the omykb knowledge base.

## Usage

`/kb:status` — full status report
`/kb:status --brief` — one-line summary

## Steps

1. Read `.omykb/config.json`. If not found, report "No KB initialized in this directory".

2. Read `.omykb/index.json` for document index.

3. **Collect stats**:

   a. **Document stats**:
      - Total documents: count entries in `index.json`
      - By type: count `file`, `url`, `git`, `image`, `text` entries
      - Total words: sum all `word_count` values
      - Total chunks: sum all `chunk_count` values

   b. **Storage stats**:
      - Use Bash `du -sh <storage.path>` to get total size
      - Count files: use Glob to count all `.md` files in storage path
      - Storage type and location from config

   c. **Topics**:
      - Extract all unique tags from all document frontmatters (use Grep for `^tags:` pattern)
      - Count documents per tag
      - Show top 10 tags by document count

   d. **Recent activity**:
      - Find 5 most recently modified files in storage path: `ls -lt <path> | head -6`
      - Show their titles and ingestion dates

   e. **AI config**:
      - Provider, chat model, embedding model
      - Check if API key env vars are set (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.) — show ✅ or ❌

   f. **Sync sources** (if configured):
      - List each source with last sync time
      - Flag sources not synced in >7 days with ⚠️

4. **Display**:

```
omykb> Knowledge Base Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Name:     <name>
Location: <storage.path>
Storage:  <type> · <size>

📚 Documents
  Total:    <n> documents · <n> words
  By type:  <n> files · <n> URLs · <n> git · <n> text
  Ingested: first <date> → latest <date>

🏷️  Top Topics
  <tag1>: <n> docs
  <tag2>: <n> docs
  ...

🤖 AI Configuration
  Provider: <provider> ✅/❌
  Chat:     <model>
  Embeddings: <model>

🔄 Sync Sources
  <source-name>: last synced <time ago> ✅/⚠️

📝 Recent Activity
  <title> — <date>
  ...

💡 Suggestions
  (if 0 docs): Run `/kb:add` to add your first document
  (if no tags): Run `/kb:organize` to auto-tag documents
  (if stale source): Run `/kb:sync` to refresh sources
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

5. For `--brief` mode, output a single line:
   `omykb: <n> docs · <size> · <top-tag>, <top-tag>, <top-tag> · last updated <time-ago>`
