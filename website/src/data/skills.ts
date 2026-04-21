export interface Skill {
  id: string
  command: string
  title: string
  description: string
  category: 'core' | 'ai' | 'team' | 'io'
  example: string
  flags?: string[]
}

export const skills: Skill[] = [
  {
    id: 'init',
    command: '/kb:init',
    title: 'Initialize',
    category: 'core',
    description: 'Set up a new knowledge base with your preferred storage backend (local, S3, or Git) and AI provider.',
    example: `> /kb:init

OMYKB> Storage backend?
  ❯ local  — ./knowledge/
    s3     — S3-compatible bucket
    git    — Git repo (team-friendly)

OMYKB> AI provider?
  ❯ openai     — GPT-4o + embeddings
    anthropic  — Claude claude-sonnet-4-6
    ollama     — Local models

OMYKB> Initialized: my-project
  Storage: local @ ./knowledge/
  AI: openai / gpt-4o
  Next: /kb:add`,
  },
  {
    id: 'add',
    command: '/kb:add',
    title: 'Add Content',
    category: 'core',
    description: 'Ingest any content into the KB — local files, URLs, raw text, Git repos, or images.',
    flags: ['<file>', '<url>', '<text>', '--git <repo>'],
    example: `> /kb:add ./architecture.pdf

OMYKB> Added: System Architecture Guide
  Source: ./architecture.pdf
  Chunks: 24 · Words: 8,420
  Stored: ./knowledge/architecture-guide.md

> /kb:add https://docs.example.com/api

OMYKB> Added: API Reference v3
  Source: https://docs.example.com/api
  Chunks: 61 · Words: 22,100`,
  },
  {
    id: 'ask',
    command: '/kb:ask',
    title: 'Ask',
    category: 'ai',
    description: 'Get AI-synthesized answers grounded in your KB. Every fact is cited — no hallucinations.',
    flags: ['<question>'],
    example: `> /kb:ask "How does the auth token refresh work?"

## Answer

The refresh token flow uses a 7-day sliding window [Source:
Architecture Guide, §3.2]. When the access token expires,
the client sends the refresh token to /auth/refresh and
receives a new pair [Source: API Reference, §auth.refresh].

Tokens are stored in httpOnly cookies — not localStorage
[Source: Security Policy, §4.1].

---
## Sources
- [1] Architecture Guide — ./knowledge/arch.md
- [2] API Reference — ./knowledge/api-ref.md
- [3] Security Policy — ./knowledge/security.md`,
  },
  {
    id: 'search',
    command: '/kb:search',
    title: 'Search',
    category: 'ai',
    description: 'Multi-strategy search across the KB — exact keyword, fuzzy phrase, and semantic matching.',
    flags: ['<query>'],
    example: `> /kb:search "rate limiting"

OMYKB> Search: "rate limiting" — 4 results

1. [API Rate Limiting Policy]
   Source: ./knowledge/api-policy.md
   ...requests are **rate limited** to 100/min per API key.
   Exceeding the limit returns HTTP 429...

2. [Backend Architecture]
   Source: ./knowledge/backend.md
   ...Redis-based **rate limiting** middleware applies...`,
  },
  {
    id: 'organize',
    command: '/kb:organize',
    title: 'Organize',
    category: 'ai',
    description: 'AI curator: auto-tag documents, detect duplicates, restructure directories, and generate topic digests.',
    flags: ['--dry-run', '--topic <tag>'],
    example: `> /kb:organize

OMYKB> Curator Analysis
  📊 42 docs · 8 topics · 6 issues

  Issues:
  ⚠️  12 documents missing tags
  ⚠️   3 potential duplicates
  ⚠️   2 generic document titles

  Proposed:
  1. Auto-tag 12 documents
  2. Create topic indexes: auth, api, deployment
  3. Merge 2 duplicates (confirm each)

Apply? [y/n]`,
  },
  {
    id: 'sync',
    command: '/kb:sync',
    title: 'Sync',
    category: 'core',
    description: 'Pull and sync content from external sources — GitHub, websites, Notion, 语雀, RSS feeds.',
    flags: ['--source <name>', '--add'],
    example: `> /kb:sync --add

OMYKB> Source type?
  ❯ git    — GitHub / GitLab repo
    web    — Website / docs site
    notion — Notion workspace
    yuque  — 语雀 knowledge base
    rss    — RSS/Atom feed

Source URL: https://github.com/org/docs

> /kb:sync

OMYKB> Sync: org/docs
  New:       8 documents
  Updated:   3 documents
  Unchanged: 41 documents`,
  },
  {
    id: 'status',
    command: '/kb:status',
    title: 'Status',
    category: 'core',
    description: 'KB health report — document count, storage usage, top topics, AI config, and sync state.',
    flags: ['--brief'],
    example: `> /kb:status

OMYKB> Knowledge Base Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Name:    my-project
Storage: local · 24 MB

📚 Documents
  Total: 87 docs · 312,000 words
  Types: 52 files · 28 URLs · 7 text

🏷️  Top Topics
  authentication: 18 docs
  deployment:     12 docs
  api:            11 docs

🤖 AI: openai / gpt-4o ✅
🔄 Sync: github-docs — 2h ago ✅`,
  },
  {
    id: 'graph',
    command: '/kb:graph',
    title: 'Graph',
    category: 'ai',
    description: 'Generate a Mermaid knowledge graph showing document relationships, topic clusters, and wiki-links.',
    flags: ['--topic <tag>', '--doc <title>', '--format mermaid|json|dot'],
    example: `> /kb:graph --topic authentication

\`\`\`mermaid
graph LR
  classDef topic fill:#6366f1,color:#fff
  classDef doc fill:#1e293b,color:#e2e8f0

  subgraph AUTH["Authentication"]
    jwt["JWT Guide"]
    oauth["OAuth Flow"]
    session["Session Mgmt"]
  end

  jwt --> oauth
  oauth --> session
  session --> jwt
\`\`\`

Nodes: 3 topics · 14 documents
Edges: 22 relationships`,
  },
  {
    id: 'export',
    command: '/kb:export',
    title: 'Export',
    category: 'io',
    description: 'Export the KB to a Markdown bundle, JSON dataset, or self-contained static HTML site.',
    flags: ['--format markdown|json|html', '--topic <tag>', '--output <path>'],
    example: `> /kb:export --format html --output ./kb-site

OMYKB> Export complete
  Format:    html (static site)
  Documents: 87
  Output:    ./kb-site/

  Files:
  ├── index.html     (search + listing)
  ├── docs/          (87 pages)
  └── assets/

Serve locally: npx serve ./kb-site`,
  },
  {
    id: 'team',
    command: '/kb:team',
    title: 'Team',
    category: 'team',
    description: 'Share the KB with teammates via Git or S3. Push/pull changes, generate invite configs.',
    flags: ['--setup', '--push', '--pull', '--invite <name>'],
    example: `> /kb:team --setup

OMYKB> Team backend?
  ❯ git — GitHub / GitLab / Gitea
    s3  — S3-compatible bucket

Repo URL: https://github.com/org/knowledge

OMYKB> Team sync enabled ✅
  Remote: github.com/org/knowledge
  Branch: main

> /kb:team --push
OMYKB> Pushed 5 changes → github.com/org/knowledge`,
  },
  {
    id: 'config',
    command: '/kb:config',
    title: 'Config',
    category: 'core',
    description: 'View and update all KB settings — storage backend, AI models, team sync, ingestion params.',
    flags: ['--edit', '--set <key> <value>'],
    example: `> /kb:config --set ai.chat_model claude-sonnet-4-6

OMYKB> Updated: ai.chat_model = claude-sonnet-4-6

> /kb:config

OMYKB> Configuration
  Storage:  local @ ./knowledge
  AI:       anthropic / claude-sonnet-4-6
  Embeddings: text-embedding-3-small
  Team:     disabled
  Chunks:   1000 chars / 200 overlap`,
  },
]

export const categories = {
  core: { label: 'Core', color: 'text-slate-300 bg-slate-700/50' },
  ai: { label: 'AI', color: 'text-indigo-300 bg-indigo-500/20' },
  team: { label: 'Team', color: 'text-violet-300 bg-violet-500/20' },
  io: { label: 'I/O', color: 'text-emerald-300 bg-emerald-500/20' },
}
