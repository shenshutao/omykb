import { useState } from 'react'
import { skills, categories } from '../data/skills'
import type { Skill } from '../data/skills'

export default function SkillsPage() {
  const [active, setActive] = useState<string>(skills[0].id)
  const [filter, setFilter] = useState<string>('all')

  const filtered = filter === 'all' ? skills : skills.filter(s => s.category === filter)
  const activeSkill = skills.find(s => s.id === active) ?? skills[0]

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <div className="mb-10">
        <div className="section-label">11 skills</div>
        <h1 className="text-3xl font-bold text-white mb-3">Skills Reference</h1>
        <p className="text-slate-400">
          Copy all <code className="text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded text-sm">.md</code> files
          from <code className="text-slate-300 bg-[#21262d] px-1.5 py-0.5 rounded text-sm">omykb/skills/</code> into
          your Claude Code skills directory to unlock all commands.
        </p>
      </div>

      {/* Install banner */}
      <div className="terminal-block p-4 mb-8 text-sm">
        <span className="text-slate-500"># One-time setup</span><br />
        <span className="text-cyan-400">cp</span>{' '}
        <span className="text-slate-300">omykb/skills/*.md ~/.claude/skills/</span>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-8">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            filter === 'all'
              ? 'bg-indigo-600 text-white'
              : 'bg-[#161b22] text-slate-400 hover:text-white border border-[#21262d]'
          }`}
        >
          All ({skills.length})
        </button>
        {Object.entries(categories).map(([key, { label, color }]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === key
                ? 'bg-indigo-600 text-white'
                : `border border-[#21262d] bg-[#161b22] hover:text-white ${color.split(' ')[0]}`
            }`}
          >
            {label} ({skills.filter(s => s.category === key).length})
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[280px_1fr] gap-6">
        {/* Skill list */}
        <div className="flex flex-col gap-2">
          {filtered.map((skill) => (
            <button
              key={skill.id}
              id={skill.id}
              onClick={() => setActive(skill.id)}
              className={`skill-card text-left transition-all ${
                active === skill.id
                  ? 'border-indigo-500/60 bg-[#1c2128]'
                  : ''
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <code className={`text-sm font-mono font-semibold ${
                  active === skill.id ? 'text-indigo-300' : 'text-indigo-400'
                }`}>
                  {skill.command}
                </code>
                <span className={`badge text-xs ${categories[skill.category].color}`}>
                  {categories[skill.category].label}
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-snug">{skill.title}</p>
            </button>
          ))}
        </div>

        {/* Skill detail */}
        <SkillDetail skill={activeSkill} />
      </div>
    </div>
  )
}

function SkillDetail({ skill }: { skill: Skill }) {
  return (
    <div className="animate-fade-in">
      <div className="skill-card mb-5">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <code className="text-xl font-mono font-bold text-indigo-300">{skill.command}</code>
          <span className={`badge ${categories[skill.category].color}`}>
            {categories[skill.category].label}
          </span>
        </div>
        <p className="text-slate-300 leading-relaxed mb-4">{skill.description}</p>

        {skill.flags && (
          <div className="flex flex-wrap gap-2">
            {skill.flags.map(flag => (
              <span key={flag} className="badge bg-[#21262d] text-slate-400 font-mono text-xs">
                {flag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-mono uppercase tracking-widest text-slate-500">Example</span>
        </div>
        <div className="terminal-block p-5 text-xs leading-relaxed overflow-x-auto whitespace-pre-wrap">
          {skill.example.split('\n').map((line, i) => {
            const isPrompt = line.startsWith('> ')
            const isSuccess = line.includes('✓') || line.includes('✅')
            const isComment = line.startsWith('#') || line.startsWith('```')
            return (
              <div
                key={i}
                className={
                  isPrompt   ? 'text-cyan-400 mt-3 first:mt-0' :
                  isSuccess  ? 'text-green-400' :
                  isComment  ? 'text-slate-600' :
                  line.startsWith('omykb>') ? 'text-slate-300' :
                  line.startsWith('  ') ? 'text-slate-400' :
                  'text-slate-300'
                }
              >
                {line || '\u00A0'}
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-5 p-4 rounded-lg border border-dashed border-[#21262d] flex items-start gap-3">
        <span className="text-slate-500 text-sm mt-0.5">📄</span>
        <div>
          <p className="text-sm text-slate-400">
            Skill file:{' '}
            <code className="text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">
              skills/{skill.command.replace('/', '').replace(':', '-')}.md
            </code>
          </p>
          <p className="text-xs text-slate-600 mt-1">
            Copy to <code>~/.claude/skills/</code> to activate in Claude Code.
          </p>
        </div>
      </div>
    </div>
  )
}
