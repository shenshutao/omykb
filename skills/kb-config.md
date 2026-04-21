---
name: kb-config
description: View and update OMYKB configuration — storage backend, AI provider, team settings
---

View and update the OMYKB knowledge base configuration.

## Usage

`/kb:config` — show current config
`/kb:config --set storage.type s3` — set a specific value
`/kb:config --edit` — open config in interactive edit mode

## Steps

### View config (`/kb:config`)

1. Read `.omykb/config.json`.
2. Display in a human-readable table:

```
OMYKB> Configuration
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Storage
  type:        local
  path:        ./knowledge

AI
  provider:    openai
  chat_model:  gpt-4o
  embeddings:  text-embedding-3-small
  temperature: 0.3

Team
  enabled:     false

Ingestion
  chunk_size:    1000
  chunk_overlap: 200
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Edit: /kb:config --edit
```

### Interactive edit (`/kb:config --edit`)

Walk through configurable sections:

1. **Storage backend**:
   - Current value shown
   - Options: `local`, `s3`, `git`
   - For `s3`: ask bucket, region, prefix, AWS credentials env var names
   - For `git`: ask repo URL, branch, subdirectory

2. **AI provider**:
   - Options: `openai`, `anthropic`, `ollama`
   - Chat model: show model list for selected provider
     - OpenAI: `gpt-4o`, `gpt-4o-mini`, `o1-mini`
     - Anthropic: `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5`
     - Ollama: ask user to enter model name (e.g. `llama3`, `mistral`)
   - Embedding model (if applicable)
   - Temperature (0.0 - 1.0, default 0.3 for factual Q&A)

3. **Team settings**:
   - Enable team sync: yes/no
   - Sync interval: seconds

4. **Ingestion settings**:
   - Chunk size: default 1000 chars
   - Chunk overlap: default 200 chars

5. Write updated config to `.omykb/config.json`.
6. Confirm: `OMYKB> Config saved.`

### Set a single value (`--set key value`)

- Parse dot-notation key (e.g., `storage.type`, `ai.chat_model`).
- Read current config, update the specified key, write back.
- Validate the value if it has known allowed values.
- Show: `OMYKB> Updated: <key> = <value>`

## Config Key Reference

| Key | Type | Description |
|-----|------|-------------|
| `storage.type` | `local\|s3\|git` | Storage backend |
| `storage.path` | string | Local path or S3 prefix |
| `storage.bucket` | string | S3 bucket name |
| `storage.repo` | string | Git repo URL |
| `ai.provider` | `openai\|anthropic\|ollama` | AI provider |
| `ai.chat_model` | string | Model for Q&A |
| `ai.embedding_model` | string | Model for embeddings |
| `ai.temperature` | float | Response temperature |
| `team.enabled` | bool | Enable team sync |
| `team.sync_interval` | int | Sync interval in seconds |
| `ingest.chunk_size` | int | Characters per chunk |
| `ingest.chunk_overlap` | int | Overlap between chunks |
