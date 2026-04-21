---
name: kb-init
description: Initialize a new OMYKB knowledge base with configurable storage backend and AI provider
---

Initialize a new OMYKB knowledge base in the current working directory.

## Steps

1. Check if `.omykb/config.json` already exists. If so, confirm with the user before overwriting.

2. Ask the user about their preferred **storage backend**:
   - `local` — files stored in a local directory (default: `./knowledge/`)
   - `s3` — S3-compatible object storage (AWS S3, MinIO, R2, etc.)
   - `git` — Git repository (team-friendly, version-controlled)

3. Ask about the **AI provider**:
   - `openai` — OpenAI GPT-4o + text-embedding-3-small (requires OPENAI_API_KEY)
   - `anthropic` — Claude claude-sonnet-4-6 for Q&A, OpenAI embeddings (requires ANTHROPIC_API_KEY)
   - `ollama` — Local Ollama models (no API key needed, specify model name)

4. Ask for optional **team settings**:
   - Enable team sync? (y/n)
   - If yes, ask for sync interval in seconds (default: 300)

5. Create the following structure:
   ```
   .omykb/
   ├── config.json       # Main configuration
   ├── index.json        # Document index (auto-maintained)
   └── cache/            # Embedding cache
   knowledge/            # Default local storage for docs
   ```

6. Write `.omykb/config.json`:
   ```json
   {
     "version": "1.0",
     "name": "<directory name>",
     "created": "<ISO timestamp>",
     "storage": {
       "type": "local|s3|git",
       "path": "./knowledge",
       "bucket": "",
       "prefix": "knowledge/",
       "repo": "",
       "branch": "main"
     },
     "ai": {
       "provider": "openai|anthropic|ollama",
       "chat_model": "gpt-4o",
       "embedding_model": "text-embedding-3-small",
       "ollama_host": "http://localhost:11434",
       "max_tokens": 4096,
       "temperature": 0.3
     },
     "team": {
       "enabled": false,
       "sync_interval": 300
     },
     "ingest": {
       "chunk_size": 1000,
       "chunk_overlap": 200,
       "supported_types": ["pdf", "docx", "md", "txt", "html", "png", "jpg"]
     }
   }
   ```

7. Write `.omykb/index.json` with empty structure:
   ```json
   { "version": "1.0", "docs": [], "topics": [], "last_updated": null }
   ```

8. Add `.omykb/cache/` to `.gitignore` if a git repo is detected.

9. Print a success summary showing what was created and next steps:
   - `OMYKB> Initialized knowledge base: <name>`
   - Storage: `<type>` at `<path>`
   - AI: `<provider>` / `<chat_model>`
   - Next: `/kb:add` to ingest your first document
