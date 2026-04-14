import React, { useState, useEffect } from 'react'
import { KBConfig, Skill, SkillFull } from '../types'
import type { SettingsSection } from '../App'

const PROVIDERS: Array<{ id: KBConfig['provider']; label: string; icon: string }> = [
  { id: 'anthropic', label: 'Anthropic (Claude)', icon: '🟣' },
  { id: 'openai',    label: 'OpenAI / Compatible', icon: '🟢' },
]

const MODELS: Record<KBConfig['provider'], Array<{ id: string; label: string }>> = {
  anthropic: [
    { id: 'claude-opus-4-6',   label: 'Claude Opus 4.6 (Recommended)' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Faster)' },
    { id: 'claude-haiku-4-5',  label: 'Claude Haiku 4.5 (Cheapest)' },
  ],
  openai: [
    { id: 'gpt-4o',          label: 'GPT-4o (Recommended)' },
    { id: 'gpt-4o-mini',     label: 'GPT-4o Mini (Cheaper)' },
    { id: 'gpt-4-turbo',     label: 'GPT-4 Turbo' },
    { id: 'gpt-3.5-turbo',   label: 'GPT-3.5 Turbo (Cheapest)' },
  ],
}

// ── LLM & API ────────────────────────────────────────────────────────────────
function LLMPage({ cfg, update, switchProvider, save, saved }: {
  cfg: KBConfig
  update: <K extends keyof KBConfig>(k: K, v: KBConfig[K]) => void
  switchProvider: (p: KBConfig['provider']) => void
  save: () => void
  saved: boolean
}) {
  const [apiKeyVisible, setApiKeyVisible] = useState(false)
  const provider = cfg.provider || 'anthropic'

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-4">
          <h1 className="text-xl font-semibold text-slate-200">LLM & API</h1>

          <section className="card p-5">
            <h2 className="text-sm font-semibold text-slate-200 mb-1">Provider</h2>
            <p className="text-xs text-slate-500 mb-3">Choose which AI provider powers your assistant.</p>
            <div className="flex gap-2">
              {PROVIDERS.map(p => (
                <button
                  key={p.id}
                  onClick={() => switchProvider(p.id)}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                    provider === p.id
                      ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                      : 'border-[#21262d] text-slate-400 hover:border-[#30363d] hover:text-slate-300'
                  }`}
                >
                  <span>{p.icon}</span>{p.label}
                </button>
              ))}
            </div>
          </section>

          <section className="card p-5">
            <h2 className="text-sm font-semibold text-slate-200 mb-1">API Key</h2>
            <p className="text-xs text-slate-500 mb-3">
              {provider === 'anthropic'
                ? <>Get your key at <span className="text-indigo-400">console.anthropic.com</span></>
                : <>Get your key at <span className="text-indigo-400">platform.openai.com</span></>}
            </p>
            <div className="flex gap-2">
              <input
                type={apiKeyVisible ? 'text' : 'password'}
                value={cfg.apiKey}
                onChange={e => update('apiKey', e.target.value)}
                placeholder={provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
                className="input-base flex-1 font-mono"
              />
              <button onClick={() => setApiKeyVisible(v => !v)} className="btn-ghost px-3">
                {apiKeyVisible ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
            {cfg.apiKey && <p className="text-xs text-emerald-500 mt-2">✓ API key configured</p>}
          </section>

          {provider === 'openai' && (
            <section className="card p-5">
              <h2 className="text-sm font-semibold text-slate-200 mb-1">Base URL <span className="text-slate-600 font-normal">(optional)</span></h2>
              <p className="text-xs text-slate-500 mb-3">
                For OpenAI-compatible endpoints: Ollama (<code className="text-indigo-400">http://localhost:11434/v1</code>), Azure, etc.
              </p>
              <input
                type="text"
                value={cfg.baseURL || ''}
                onChange={e => update('baseURL', e.target.value)}
                placeholder="https://api.openai.com/v1"
                className="input-base font-mono text-xs"
              />
            </section>
          )}

          <section className="card p-5">
            <h2 className="text-sm font-semibold text-slate-200 mb-1">Model</h2>
            <div className="space-y-2">
              {MODELS[provider].map(m => (
                <label key={m.id} className="flex items-center gap-3 cursor-pointer">
                  <input type="radio" name="model" value={m.id} checked={cfg.model === m.id}
                    onChange={() => update('model', m.id)} className="accent-indigo-500" />
                  <div>
                    <div className="text-sm text-slate-300">{m.label}</div>
                    <div className="text-xs text-slate-600 font-mono">{m.id}</div>
                  </div>
                </label>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-[#21262d]">
              <p className="text-xs text-slate-500 mb-1.5">Or enter a custom model ID:</p>
              <input
                type="text"
                value={MODELS[provider].some(m => m.id === cfg.model) ? '' : cfg.model}
                onChange={e => update('model', e.target.value)}
                placeholder={MODELS[provider][0].id}
                className="input-base font-mono text-xs"
              />
            </div>
          </section>
        </div>
      </div>
      <div className="border-t border-[#21262d] px-6 py-4 flex items-center gap-3">
        <button onClick={save} className="btn-primary px-6">Save</button>
        {saved && (
          <span className="text-sm text-emerald-400 flex items-center gap-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Saved
          </span>
        )}
      </div>
    </div>
  )
}

// ── Storage ───────────────────────────────────────────────────────────────────
function StoragePage({ cfg, update, save, saved }: {
  cfg: KBConfig
  update: <K extends keyof KBConfig>(k: K, v: KBConfig[K]) => void
  save: () => void
  saved: boolean
}) {
  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-4">
          <h1 className="text-xl font-semibold text-slate-200">Storage</h1>
          <section className="card p-5">
            <h2 className="text-sm font-semibold text-slate-200 mb-1">Storage Path</h2>
            <p className="text-xs text-slate-500 mb-3">
              Directory where your knowledge base documents are stored locally.
            </p>
            <input
              type="text"
              value={cfg.storagePath}
              onChange={e => update('storagePath', e.target.value)}
              className="input-base font-mono text-xs"
            />
          </section>
        </div>
      </div>
      <div className="border-t border-[#21262d] px-6 py-4 flex items-center gap-3">
        <button onClick={save} className="btn-primary px-6">Save</button>
        {saved && (
          <span className="text-sm text-emerald-400 flex items-center gap-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Saved
          </span>
        )}
      </div>
    </div>
  )
}

// ── System Prompt ─────────────────────────────────────────────────────────────
function PromptPage({ cfg, update, save, saved }: {
  cfg: KBConfig
  update: <K extends keyof KBConfig>(k: K, v: KBConfig[K]) => void
  save: () => void
  saved: boolean
}) {
  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-4">
          <h1 className="text-xl font-semibold text-slate-200">System Prompt</h1>
          <section className="card p-5">
            <h2 className="text-sm font-semibold text-slate-200 mb-1">Custom System Prompt <span className="text-slate-600 font-normal">(optional)</span></h2>
            <p className="text-xs text-slate-500 mb-3">Override the default agent persona and instructions.</p>
            <textarea
              value={cfg.systemPrompt || ''}
              onChange={e => update('systemPrompt', e.target.value)}
              placeholder="You are a helpful knowledge base assistant…"
              rows={12}
              className="input-base resize-none text-xs font-mono"
            />
          </section>
        </div>
      </div>
      <div className="border-t border-[#21262d] px-6 py-4 flex items-center gap-3">
        <button onClick={save} className="btn-primary px-6">Save</button>
        {saved && (
          <span className="text-sm text-emerald-400 flex items-center gap-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Saved
          </span>
        )}
      </div>
    </div>
  )
}

// ── Skills ────────────────────────────────────────────────────────────────────
function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [activeSkill, setActiveSkill] = useState<SkillFull | null>(null)
  const [skillDraft, setSkillDraft] = useState('')
  const [skillSaved, setSkillSaved] = useState(false)
  const [skillSaving, setSkillSaving] = useState(false)

  useEffect(() => { window.omykb.listSkills().then(setSkills) }, [])

  const openSkill = async (s: Skill) => {
    const full = await window.omykb.getSkill(s.name)
    if (full) { setActiveSkill(full); setSkillDraft(full.content); setSkillSaved(false) }
  }

  const saveSkill = async () => {
    if (!activeSkill) return
    setSkillSaving(true)
    await window.omykb.saveSkill(activeSkill.source, skillDraft)
    setSkillSaving(false)
    setSkillSaved(true)
    setTimeout(() => setSkillSaved(false), 2000)
  }

  if (activeSkill) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-6 py-4 border-b border-[#21262d] flex items-center gap-3">
          <button
            onClick={() => { setActiveSkill(null); setSkillDraft('') }}
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-slate-200">{activeSkill.command}</span>
            <span className="ml-3 text-xs text-slate-600 font-mono truncate">{activeSkill.source}</span>
          </div>
        </div>
        <div className="flex-1 min-h-0 p-6">
          <textarea
            value={skillDraft}
            onChange={e => { setSkillDraft(e.target.value); setSkillSaved(false) }}
            className="w-full h-full resize-none input-base text-xs font-mono"
            spellCheck={false}
          />
        </div>
        <div className="border-t border-[#21262d] px-6 py-4 flex items-center justify-end gap-2">
          {skillSaved && (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              Saved
            </span>
          )}
          <button onClick={saveSkill} disabled={skillSaving} className="btn-primary px-6">
            {skillSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-xl font-semibold text-slate-200 mb-1">Skills</h1>
        <p className="text-xs text-slate-500 mb-6">View and edit the skill prompts used by the agent.</p>
        <div className="space-y-2">
          {skills.map(s => (
            <button
              key={s.name}
              onClick={() => openSkill(s)}
              className="w-full text-left flex items-center justify-between gap-2 px-4 py-3 rounded-lg border border-[#21262d] hover:border-[#30363d] hover:bg-[#161b22] transition-colors"
            >
              <div>
                <span className="text-sm font-mono text-amber-300">{s.command}</span>
                {s.description && <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">{s.description}</p>}
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-600 flex-shrink-0"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function Settings({ section = 'llm' }: { section?: SettingsSection }) {
  const [cfg, setCfg] = useState<KBConfig | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.omykb.getConfig().then(c => setCfg({ provider: 'anthropic', baseURL: '', ...c }))
  }, [])

  // Reset saved indicator when switching sections
  useEffect(() => { setSaved(false) }, [section])

  const update = <K extends keyof KBConfig>(key: K, value: KBConfig[K]) => {
    if (!cfg) return
    setCfg(prev => ({ ...prev!, [key]: value }))
    setSaved(false)
  }

  const switchProvider = (provider: KBConfig['provider']) => {
    if (!cfg) return
    setCfg(prev => ({ ...prev!, provider, model: MODELS[provider][0].id, apiKey: '', baseURL: '' }))
    setSaved(false)
  }

  const save = async () => {
    if (!cfg) return
    for (const [k, v] of Object.entries(cfg)) await window.omykb.setConfig(k, v)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!cfg) {
    return <div className="h-full flex items-center justify-center text-slate-500 text-sm">Loading…</div>
  }

  if (section === 'skills') return <SkillsPage />
  if (section === 'storage') return <StoragePage cfg={cfg} update={update} save={save} saved={saved} />
  if (section === 'prompt')  return <PromptPage  cfg={cfg} update={update} save={save} saved={saved} />
  return <LLMPage cfg={cfg} update={update} switchProvider={switchProvider} save={save} saved={saved} />
}
