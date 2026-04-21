import { useState } from 'react'
import { Link } from 'react-router-dom'

type Section = { id: string; title: string; content: React.ReactNode }

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('quickstart')

  const section = SECTIONS.find(s => s.id === activeSection) ?? SECTIONS[0]

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <div className="grid lg:grid-cols-[220px_1fr] gap-10">
        {/* Sidebar */}
        <nav className="hidden lg:block">
          <div className="sticky top-20 space-y-1">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  activeSection === s.id
                    ? 'bg-[#21262d] text-white'
                    : 'text-slate-400 hover:text-white hover:bg-[#161b22]'
                }`}
              >
                {s.title}
              </button>
            ))}
          </div>
        </nav>

        {/* Mobile section picker */}
        <div className="lg:hidden">
          <select
            value={activeSection}
            onChange={e => setActiveSection(e.target.value)}
            className="w-full bg-[#161b22] border border-[#21262d] rounded-lg px-3 py-2 text-sm text-white mb-6"
          >
            {SECTIONS.map(s => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        </div>

        {/* Content */}
        <article className="min-w-0 animate-fade-in prose-custom">
          <h1 className="text-2xl font-bold text-white mb-6">{section.title}</h1>
          {section.content}
        </article>
      </div>
    </div>
  )
}

function Code({ children }: { children: string }) {
  return (
    <div className="terminal-block p-4 my-4 text-sm leading-relaxed whitespace-pre">
      {children}
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-indigo-500/20 bg-indigo-500/5 rounded-lg p-4 my-4 text-sm text-slate-300 leading-relaxed">
      <span className="text-indigo-400 font-medium">Note: </span>{children}
    </div>
  )
}

function H2({ children }: { children: string }) {
  return <h2 className="text-lg font-semibold text-white mt-8 mb-3">{children}</h2>
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-slate-400 leading-relaxed mb-4">{children}</p>
}

const SECTIONS: Section[] = [
  {
    id: 'quickstart',
    title: 'Quick Start',
    content: (
      <>
        <P>Get OMYKB running in under 2 minutes.</P>

        <H2>1. Install skills</H2>
        <P>Clone the repo and copy the skills into your Claude Code skills directory:</P>
        <Code>{`git clone https://github.com/omykb/omykb
cd omykb
cp skills/*.md ~/.claude/skills/`}</Code>

        <H2>2. Initialize a knowledge base</H2>
        <P>In any project directory, run:</P>
        <Code>{`❯ /kb:init`}</Code>
        <P>
          You'll be prompted to choose a storage backend (local, S3, or Git) and an AI provider
          (OpenAI, Anthropic, or Ollama). A <code className="text-slate-300">.omykb/</code> config
          directory is created.
        </P>

        <H2>3. Add your first document</H2>
        <Code>{`❯ /kb:add ./notes.pdf
❯ /kb:add https://docs.example.com
❯ /kb:add "Meeting notes from today: decided to use PostgreSQL..."`}</Code>

        <H2>4. Ask questions</H2>
        <Code>{`❯ /kb:ask "What database did we decide to use?"

## Answer
PostgreSQL was chosen for the main data store [Source: Meeting
notes, §decisions]. The team preferred it over MySQL due to
better JSON support and full-text search capabilities.

Sources:
- [1] Meeting Notes — ./knowledge/meeting-notes.md`}</Code>

        <Note>
          Every answer is grounded in your documents and includes citations. If the KB doesn't have enough
          information, omykb will tell you rather than hallucinate.
        </Note>
      </>
    ),
  },
  {
    id: 'installation',
    title: 'Installation',
    content: (
      <>
        <P>OMYKB is a collection of Claude Code skill files — no binary to install, no dependencies.</P>

        <H2>Requirements</H2>
        <ul className="list-disc list-inside text-slate-400 space-y-1.5 mb-4 text-sm">
          <li>Claude Code (Claude CLI) installed</li>
          <li>An AI provider API key — OpenAI, Anthropic, or local Ollama</li>
          <li>Git (optional, for Git storage backend or sync)</li>
          <li>AWS CLI (optional, for S3 storage backend)</li>
        </ul>

        <H2>Manual installation</H2>
        <Code>{`# Download individual skills
curl -O https://raw.githubusercontent.com/omykb/omykb/main/skills/kb-init.md
curl -O https://raw.githubusercontent.com/omykb/omykb/main/skills/kb-add.md
# ... etc
mv kb-*.md ~/.claude/skills/`}</Code>

        <H2>Verify installation</H2>
        <Code>{`# In Claude Code, type:
❯ /kb:status

# Should show:
OMYKB> No KB initialized in this directory.
# (This means the skill is installed correctly)
# Run /kb:init to initialize a new KB.`}</Code>

        <H2>Environment variables</H2>
        <P>Set your AI provider credentials before running:</P>
        <Code>{`# OpenAI
export OPENAI_API_KEY=sk-...

# Anthropic
export ANTHROPIC_API_KEY=sk-ant-...

# Ollama (no key needed, just run Ollama locally)
# Default: http://localhost:11434`}</Code>
      </>
    ),
  },
  {
    id: 'storage',
    title: 'Storage Backends',
    content: (
      <>
        <P>OMYKB supports three storage backends. Configure in <code className="text-slate-300">.omykb/config.json</code> or via <code className="text-indigo-400">/kb:config --edit</code>.</P>

        <H2>Local (default)</H2>
        <P>Documents stored in a local directory. Simplest setup, works offline.</P>
        <Code>{`{
  "storage": {
    "type": "local",
    "path": "./knowledge"   // relative or absolute path
  }
}`}</Code>

        <H2>S3-compatible</H2>
        <P>Store documents in any S3-compatible service: AWS S3, MinIO, Cloudflare R2, Backblaze B2.</P>
        <Code>{`{
  "storage": {
    "type": "s3",
    "bucket": "my-kb-bucket",
    "prefix": "knowledge/",
    "region": "us-east-1"
  }
}

# Credentials via environment:
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...`}</Code>

        <H2>Git repository</H2>
        <P>Version-controlled knowledge base. Full diff history. Best for teams.</P>
        <Code>{`{
  "storage": {
    "type": "git",
    "repo": "https://github.com/your-org/knowledge",
    "branch": "main",
    "path": "./knowledge"
  }
}`}</Code>
        <P>Use <code className="text-indigo-400">/kb:team --push</code> and <code className="text-indigo-400">/kb:team --pull</code> to sync with teammates.</P>

        <Note>
          You can switch backends at any time with <code className="text-indigo-400">/kb:config --set storage.type s3</code>.
          Documents already stored will need to be migrated manually.
        </Note>
      </>
    ),
  },
  {
    id: 'ai-providers',
    title: 'AI Providers',
    content: (
      <>
        <P>OMYKB works with any AI provider for Q&A. Configure via <code className="text-indigo-400">/kb:config --edit</code>.</P>

        <H2>OpenAI (recommended)</H2>
        <Code>{`{
  "ai": {
    "provider": "openai",
    "chat_model": "gpt-4o",
    "embedding_model": "text-embedding-3-small",
    "temperature": 0.3
  }
}
export OPENAI_API_KEY=sk-...`}</Code>

        <H2>Anthropic Claude</H2>
        <Code>{`{
  "ai": {
    "provider": "anthropic",
    "chat_model": "claude-sonnet-4-6",
    "embedding_model": "text-embedding-3-small",  // still uses OpenAI for embeddings
    "temperature": 0.3
  }
}
export ANTHROPIC_API_KEY=sk-ant-...`}</Code>

        <H2>Ollama (local, no API key)</H2>
        <Code>{`{
  "ai": {
    "provider": "ollama",
    "chat_model": "llama3.1",
    "ollama_host": "http://localhost:11434",
    "temperature": 0.3
  }
}
# No API key needed. Install: https://ollama.ai`}</Code>

        <Note>
          For <code>/kb:ask</code> quality, GPT-4o and Claude claude-sonnet-4-6 provide the best citation accuracy.
          Ollama is great for fully offline, private setups.
        </Note>
      </>
    ),
  },
  {
    id: 'team',
    title: 'Team Setup',
    content: (
      <>
        <P>Share a knowledge base with your team using Git or S3.</P>

        <H2>Git-based team KB</H2>
        <P><strong className="text-white">Person A</strong> sets up the shared KB:</P>
        <Code>{`❯ /kb:init
# Choose: storage=git, enter your GitHub repo URL

❯ /kb:add ./company-wiki.pdf
❯ /kb:team --push
# Pushes ./knowledge/ to the Git repo`}</Code>

        <P><strong className="text-white">Person B</strong> joins the team:</P>
        <Code>{`❯ /kb:team --setup
# Enter the same repo URL

❯ /kb:team --pull
# Pulls all documents

❯ /kb:ask "What's our refund policy?"
# Answers from the shared KB`}</Code>

        <H2>Invite snippet</H2>
        <P>Generate a one-liner config for new teammates:</P>
        <Code>{`❯ /kb:team --invite alice

OMYKB> Invite config for alice:

{
  "storage": { "type": "git", "repo": "...", "branch": "main" },
  "ai": { "provider": "openai", "chat_model": "gpt-4o" },
  "team": { "enabled": true, "member": "alice" }
}

Share this + run: /kb:init (paste config)`}</Code>

        <H2>S3-based team KB</H2>
        <Code>{`# All team members use the same bucket:
❯ /kb:config --set storage.type s3
❯ /kb:config --set storage.bucket team-knowledge-bucket

# Each member syncs manually:
❯ /kb:team --push   # upload local changes
❯ /kb:team --pull   # download latest`}</Code>
      </>
    ),
  },
  {
    id: 'config-reference',
    title: 'Config Reference',
    content: (
      <>
        <P>Full <code className="text-slate-300">.omykb/config.json</code> reference.</P>
        <Code>{`{
  "version": "1.0",
  "name": "my-project",           // KB display name
  "created": "2026-04-13T...",

  "storage": {
    "type": "local",              // local | s3 | git
    "path": "./knowledge",        // local: directory path
    "bucket": "",                 // s3: bucket name
    "prefix": "knowledge/",       // s3: key prefix
    "repo": "",                   // git: remote URL
    "branch": "main"              // git: branch
  },

  "ai": {
    "provider": "openai",         // openai | anthropic | ollama
    "chat_model": "gpt-4o",
    "embedding_model": "text-embedding-3-small",
    "ollama_host": "http://localhost:11434",
    "max_tokens": 4096,
    "temperature": 0.3            // lower = more factual
  },

  "team": {
    "enabled": false,
    "sync_interval": 300          // seconds between auto-syncs
  },

  "ingest": {
    "chunk_size": 1000,           // characters per chunk
    "chunk_overlap": 200,         // overlap between chunks
    "supported_types": [
      "pdf", "docx", "md", "txt", "html",
      "png", "jpg", "jpeg", "webp"
    ]
  },

  "sources": [                    // configured by /kb:sync --add
    {
      "name": "github-docs",
      "type": "git",
      "url": "https://github.com/org/docs",
      "include": ["*.md"],
      "exclude": ["node_modules/"],
      "last_synced": null,
      "sync_interval": 3600
    }
  ]
}`}</Code>
      </>
    ),
  },
  {
    id: 'skills-install',
    title: 'Skills for Claude Code',
    content: (
      <>
        <P>
          All OMYKB functionality is available as Claude Code skills — plain Markdown files that
          Claude Code reads and executes as slash commands.
        </P>

        <H2>What are skills?</H2>
        <P>
          Skills are <code className="text-slate-300">.md</code> files placed in <code className="text-slate-300">~/.claude/skills/</code>.
          Claude Code automatically detects them and makes them available as <code className="text-slate-300">/command</code> shortcuts.
          Each skill file contains natural-language instructions that Claude follows when the command is invoked.
        </P>

        <H2>Install all skills</H2>
        <Code>{`git clone https://github.com/omykb/omykb
cp omykb/skills/*.md ~/.claude/skills/`}</Code>

        <H2>Available skills</H2>
        <div className="space-y-2 my-4">
          {[
            ['kb-init.md', '/kb:init', 'Initialize KB'],
            ['kb-add.md', '/kb:add', 'Ingest content'],
            ['kb-ask.md', '/kb:ask', 'Q&A with citations'],
            ['kb-search.md', '/kb:search', 'Search KB'],
            ['kb-organize.md', '/kb:organize', 'AI curation'],
            ['kb-sync.md', '/kb:sync', 'External source sync'],
            ['kb-status.md', '/kb:status', 'KB stats'],
            ['kb-graph.md', '/kb:graph', 'Knowledge graph'],
            ['kb-export.md', '/kb:export', 'Export KB'],
            ['kb-config.md', '/kb:config', 'Edit config'],
            ['kb-team.md', '/kb:team', 'Team sharing'],
          ].map(([file, cmd, desc]) => (
            <div key={file} className="flex items-center gap-4 py-2 border-b border-[#21262d] text-sm">
              <code className="text-slate-500 w-32 flex-shrink-0">{file}</code>
              <code className="text-indigo-400 w-28 flex-shrink-0">{cmd}</code>
              <span className="text-slate-400">{desc}</span>
            </div>
          ))}
        </div>

        <H2>Customize a skill</H2>
        <P>
          Each skill file is plain Markdown — edit it to change behavior. For example, to
          default to a different chunk size or add custom curation rules to <code className="text-indigo-400">/kb:organize</code>,
          just edit <code className="text-slate-300">~/.claude/skills/kb-organize.md</code>.
        </P>

        <Note>
          Skills work identically whether you use Claude Code in the terminal, VS Code extension,
          or the Claude web app. They're just files.
        </Note>

        <div className="mt-8 flex gap-3">
          <Link
            to="/skills"
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
          >
            Browse all skills with examples →
          </Link>
        </div>
      </>
    ),
  },
]
