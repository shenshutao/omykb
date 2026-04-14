---
name: kb-add
description: Ingest content into the knowledge base — supports files, URLs, text, git repos, and images
---

Add content to the omykb knowledge base. Reads `.omykb/config.json` for storage settings.

## Usage Patterns

The user may provide:
- A local file path: `kb:add ./report.pdf`
- A URL: `kb:add https://example.com/docs`
- Raw text: `kb:add "The meeting notes from today..."`
- A git repo: `kb:add https://github.com/owner/repo`
- An image: `kb:add ./screenshot.png`
- No argument: interactive mode, ask what to add

## Steps

1. Read `.omykb/config.json`. If not found, tell user to run `/kb:init` first.

2. Detect the **input type** from the argument:
   - Starts with `http://` or `https://` → URL or git repo
   - Ends with `.git` or contains `github.com/` / `gitlab.com/` → Git repo
   - Local file path with image extension (`.png`, `.jpg`, `.jpeg`, `.webp`) → Image
   - Local file path → Document file
   - Otherwise → Raw text

3. **Extract content** by type:
   - **PDF/DOCX/TXT/MD/HTML**: Read file contents using Read tool. For binary formats, use `pdftotext` or `python-docx` via Bash if available, otherwise note limitation.
   - **URL**: Use WebFetch to retrieve page content, extract main text (strip nav/footer boilerplate).
   - **Git repo**: Clone/pull the repo to a temp dir, recursively collect `.md`, `.txt`, `.rst`, code files. Respect `.gitignore`.
   - **Image**: Describe that the AI provider's vision capability will analyze this image (requires OpenAI or Anthropic vision models). Read the image and summarize its content.
   - **Raw text**: Use as-is.

4. **Chunk the content**:
   - Split into chunks of `config.ingest.chunk_size` characters with `chunk_overlap` overlap.
   - Preserve heading structure — start new chunks at `##` / `###` boundaries when possible.
   - Each chunk gets metadata: `source`, `title`, `chunk_index`, `total_chunks`, `ingested_at`.

5. **Store the document**:
   - Determine storage path based on `config.storage`:
     - `local`: write to `<storage.path>/<sanitized_title>.md`
     - `s3`: note the upload command needed (`aws s3 cp` or `mc cp`)
     - `git`: write to `<storage.path>/` and show the `git add && git commit` command
   - Store the full extracted text as a Markdown file with YAML frontmatter:
     ```markdown
     ---
     id: <uuid>
     title: <detected or provided title>
     source: <original path/url>
     type: file|url|git|image|text
     ingested_at: <ISO timestamp>
     tags: []
     ---
     <content>
     ```

6. **Update `.omykb/index.json`**: Append the new document entry:
   ```json
   {
     "id": "<uuid>",
     "title": "<title>",
     "source": "<source>",
     "type": "<type>",
     "path": "<storage path>",
     "ingested_at": "<timestamp>",
     "chunk_count": <n>,
     "word_count": <n>,
     "tags": []
   }
   ```

7. Print a success summary:
   - `omykb> Added: <title>`
   - Source: `<source>`
   - Chunks: `<n>` · Words: `<n>`
   - Stored at: `<path>`
   - Tip: run `/kb:ask` to query this document
