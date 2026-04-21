---
name: kb-export
description: Export the knowledge base to Markdown bundle, JSON, or a static HTML site
---

Export all or part of the OMYKB knowledge base to a portable format.

## Usage

`/kb:export` — interactive export
`/kb:export --format markdown` — export all docs as a single Markdown bundle
`/kb:export --format json` — export index + content as JSON
`/kb:export --format html` — generate a static HTML site
`/kb:export --topic <tag>` — export only documents with a specific tag
`/kb:export --output <path>` — specify output path (default: `./omykb-export/`)

## Formats

### Markdown Bundle (`--format markdown`)

Generates a single `KNOWLEDGE_BASE.md` file:
```markdown
---
title: <KB name>
exported_at: <timestamp>
doc_count: <n>
---

# <KB Name> — Knowledge Base

## Table of Contents
- [Document 1](#anchor)
- [Document 2](#anchor)
...

---

# Document 1

> Source: <source> | Ingested: <date> | Tags: <tags>

<full content>

---

# Document 2
...
```

### JSON Export (`--format json`)

Generates `omykb-export.json`:
```json
{
  "version": "1.0",
  "name": "<KB name>",
  "exported_at": "<timestamp>",
  "documents": [
    {
      "id": "<id>",
      "title": "<title>",
      "source": "<source>",
      "tags": [],
      "content": "<full markdown content>",
      "metadata": { ... }
    }
  ],
  "topics": { "<tag>": ["<doc-id>", ...] }
}
```

### Static HTML Site (`--format html`)

Generates a self-contained HTML site in `./omykb-export/`:
```
omykb-export/
├── index.html        # Home with search + document list
├── docs/
│   ├── doc-1.html
│   ├── doc-2.html
│   └── ...
└── assets/
    └── style.css
```

The HTML site includes:
- Full-text client-side search (no server needed)
- Responsive design
- Markdown rendered to HTML
- Table of contents per document

## Steps

1. Read config and index.
2. Determine output format and path from arguments or interactive prompts.
3. Apply topic filter if `--topic` specified.
4. Read all selected document files.
5. Generate the appropriate output format.
6. Write output files.
7. Report:
   ```
   OMYKB> Export complete
      Format:    <format>
      Documents: <n>
      Output:    <path>
   ```
