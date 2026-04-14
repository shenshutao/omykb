import { Link } from 'react-router-dom'
import TerminalDemo from '../components/TerminalDemo'
import { skills, categories } from '../data/skills'

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-20 pb-16">
        <div className="max-w-3xl">
          <div className="section-label">open source · mit license</div>
          <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight mb-5">
            Your AI knowledge base,{' '}
            <span className="gradient-text">in your terminal</span>
          </h1>
          <p className="text-lg text-slate-400 leading-relaxed mb-8 max-w-2xl">
            omykb is an open-source personal and team knowledge base tool.
            Ingest any content, ask questions with citations, and organize knowledge automatically —
            all via Claude Code skills. Configurable storage: local, S3, or Git.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/docs"
              className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-colors"
            >
              Get Started
            </Link>
            <Link
              to="/skills"
              className="px-5 py-2.5 rounded-lg border border-[#21262d] hover:border-indigo-500/40 hover:bg-[#161b22] text-slate-300 font-medium text-sm transition-colors"
            >
              Browse Skills →
            </Link>
            <a
              href="https://github.com/omykb/omykb"
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-2.5 rounded-lg border border-[#21262d] hover:border-slate-500 hover:bg-[#161b22] text-slate-400 font-medium text-sm transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              Star on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Terminal demo + quick install */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
        <div className="grid lg:grid-cols-2 gap-8 items-start">
          <TerminalDemo />

          <div className="space-y-5">
            <div className="skill-card">
              <div className="section-label">Quick install</div>
              <p className="text-sm text-slate-400 mb-3">
                Copy the skills into your Claude Code skills directory:
              </p>
              <div className="terminal-block p-4 text-xs text-slate-300">
                <span className="text-slate-500"># Clone the repo</span><br />
                <span className="text-cyan-400">git clone</span> https://github.com/omykb/omykb<br />
                <br />
                <span className="text-slate-500"># Copy skills to Claude Code</span><br />
                <span className="text-cyan-400">cp</span> omykb/skills/*.md ~/.claude/skills/<br />
                <br />
                <span className="text-slate-500"># Initialize your KB</span><br />
                <span className="text-green-400">❯ /kb:init</span>
              </div>
            </div>

            <div className="skill-card">
              <div className="section-label">Storage backends</div>
              <div className="space-y-2.5 text-sm">
                {[
                  { icon: '📁', name: 'Local', desc: 'Files in ./knowledge/ — works offline, zero config' },
                  { icon: '☁️', name: 'S3-compatible', desc: 'AWS S3, MinIO, R2, Backblaze — team-ready' },
                  { icon: '🔀', name: 'Git repo', desc: 'Version-controlled, full diff history, any git host' },
                ].map(({ icon, name, desc }) => (
                  <div key={name} className="flex gap-3">
                    <span className="text-lg flex-shrink-0 mt-0.5">{icon}</span>
                    <div>
                      <span className="text-white font-medium">{name}</span>
                      <span className="text-slate-500 ml-1.5">— {desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-[#21262d] py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="section-label text-center">why omykb</div>
          <h2 className="text-2xl font-bold text-white text-center mb-12">
            Works where you work
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(({ icon, title, desc }) => (
              <div key={title} className="skill-card">
                <div className="text-2xl mb-3">{icon}</div>
                <h3 className="text-white font-semibold mb-1.5">{title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Skills grid preview */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="section-label">11 skills</div>
              <h2 className="text-2xl font-bold text-white">Everything you need</h2>
            </div>
            <Link to="/skills" className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
              View all →
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {skills.map((skill) => (
              <Link key={skill.id} to={`/skills#${skill.id}`} className="skill-card group">
                <div className="flex items-start justify-between mb-2">
                  <code className="text-indigo-400 text-sm font-mono font-medium group-hover:text-indigo-300">
                    {skill.command}
                  </code>
                  <span className={`badge text-xs ${categories[skill.category].color}`}>
                    {categories[skill.category].label}
                  </span>
                </div>
                <p className="text-sm text-slate-400 leading-snug">{skill.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-[#21262d] py-20">
        <div className="max-w-xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold text-white mb-3">
            Ready to build your knowledge base?
          </h2>
          <p className="text-slate-400 mb-7">
            Open source, MIT licensed. No accounts, no subscriptions — just your AI, your content, your storage.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              to="/docs"
              className="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-colors"
            >
              Read the Docs
            </Link>
            <a
              href="https://github.com/omykb/omykb"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-2.5 rounded-lg border border-[#21262d] hover:border-slate-500 text-slate-300 font-medium text-sm transition-colors"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>
    </>
  )
}

const FEATURES = [
  {
    icon: '🔐',
    title: 'Your data, your control',
    desc: 'Store everything locally, in your own S3 bucket, or a private Git repo. Nothing leaves your infrastructure.',
  },
  {
    icon: '🤖',
    title: 'AI-grounded answers',
    desc: 'Every answer is cited. Ask questions and get responses backed by your actual documents, not model hallucinations.',
  },
  {
    icon: '⚡',
    title: 'Terminal-native',
    desc: 'Works inside Claude Code as slash-command skills. No web UI to maintain, no context-switching.',
  },
  {
    icon: '🧹',
    title: 'Auto-curating',
    desc: 'The curator agent auto-tags, deduplicates, restructures directories, and generates topic digests.',
  },
  {
    icon: '🔀',
    title: 'Any source',
    desc: 'Ingest PDFs, DOCX, Markdown, URLs, Git repos, images, Notion, 语雀, RSS — unified into one KB.',
  },
  {
    icon: '👥',
    title: 'Team-ready',
    desc: 'Share via Git or S3. Push/pull changes. Invite teammates with a single config snippet.',
  },
]
