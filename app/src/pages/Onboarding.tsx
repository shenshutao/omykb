import React, { useState } from 'react'
import { KBConfig, Workspace } from '../types'

const CHAT_MODELS: Record<KBConfig['provider'], Array<{ id: string; label: string }>> = {
  anthropic: [
    { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  ],
  openai: [
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  ],
}

const ASR_MODELS: Record<NonNullable<KBConfig['asrProvider']>, Array<{ id: string; label: string }>> = {
  openai: [{ id: 'whisper-1', label: 'Whisper 1' }],
  aliyun: [
    { id: 'paraformer-v2', label: 'Paraformer v2' },
    { id: 'paraformer-8k-v2', label: 'Paraformer 8k v2' },
    { id: 'paraformer-mtl-v1', label: 'Paraformer MTL v1' },
  ],
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{children}</div>
}

export default function Onboarding({
  initialConfig,
  onComplete,
}: {
  initialConfig: KBConfig
  onComplete: (workspaces: Workspace[], activeWorkspaceId: string | null) => void
}) {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [cfg, setCfg] = useState<KBConfig>({
    ...initialConfig,
    provider: initialConfig.provider || 'anthropic',
    chatModel: initialConfig.chatModel || initialConfig.model || 'claude-opus-4-6',
    asrProvider: initialConfig.asrProvider || 'openai',
    asrModel: initialConfig.asrModel || 'whisper-1',
  })

  const provider = cfg.provider || 'anthropic'
  const asrProvider = cfg.asrProvider || 'openai'

  const update = <K extends keyof KBConfig>(key: K, value: KBConfig[K]) => {
    setCfg(prev => ({ ...prev, [key]: value }))
  }

  const save = async () => {
    setSaving(true)
    const finalCfg: KBConfig = {
      ...cfg,
      model: cfg.chatModel || cfg.model,
      setupCompleted: true,
    }
    for (const [key, value] of Object.entries(finalCfg)) {
      await window.omykb.setConfig(key, value)
    }
    let workspaces = await window.omykb.listWorkspaces()
    if (workspaces.length === 0) {
      const workspace = await window.omykb.createWorkspace('My Knowledge Base')
      workspaces = [workspace]
    }
    setSaving(false)
    onComplete(workspaces, workspaces[0]?.id ?? null)
  }

  return (
    <div className="h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(79,157,255,0.18),_transparent_34%),linear-gradient(180deg,_#0b1020_0%,_#02030a_100%)] text-slate-100">
      <div className="h-full drag-region" />
      <div className="fixed inset-0 flex items-center justify-center px-6">
        <div className="w-full max-w-3xl rounded-[32px] border border-white/10 bg-[#0f172a]/90 p-8 shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl no-drag">
          <div className="mb-8 flex items-start justify-between gap-6">
            <div>
              <div className="text-[11px] uppercase tracking-[0.28em] text-sky-300/80">First run setup</div>
              <h1 className="mt-3 text-3xl font-semibold text-white">Set up OMYKB</h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-400">
                Configure the minimum needed to import sources, transcribe media, and chat with your local knowledge base.
              </p>
            </div>
            <div className="flex gap-2">
              {[0, 1, 2].map(i => (
                <div key={i} className={`h-2.5 w-9 rounded-full ${i === step ? 'bg-sky-300' : i < step ? 'bg-emerald-400' : 'bg-white/10'}`} />
              ))}
            </div>
          </div>

          {step === 0 && (
            <div className="space-y-5">
              <div>
                <FieldLabel>Knowledge Base Location</FieldLabel>
                <input
                  value={cfg.storagePath}
                  onChange={e => update('storagePath', e.target.value)}
                  className="input-base font-mono text-xs"
                />
                <p className="mt-2 text-xs text-slate-500">Choose this first. OMYKB stores workspace Markdown files, indexes, and imported sources under this directory.</p>
              </div>
              <div className="rounded-2xl border border-sky-300/15 bg-sky-300/[0.06] px-4 py-3 text-xs leading-relaxed text-slate-400">
                You can move this later in Settings, but choosing the right local folder now keeps all imported knowledge organized from the start.
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <FieldLabel>AI Provider</FieldLabel>
                <div className="grid grid-cols-2 gap-3">
                  {(['anthropic', 'openai'] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => {
                        const model = CHAT_MODELS[p][0].id
                        setCfg(prev => ({ ...prev, provider: p, model, chatModel: model, apiKey: '', baseURL: '' }))
                      }}
                      className={`rounded-2xl border px-5 py-4 text-left transition-colors ${
                        provider === p ? 'border-sky-300/70 bg-sky-300/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                      }`}
                    >
                      <div className="text-sm font-semibold text-slate-100">{p === 'anthropic' ? 'Anthropic Claude' : 'OpenAI / Compatible'}</div>
                      <div className="mt-1 text-xs text-slate-500">{p === 'anthropic' ? 'Best for long-context reasoning.' : 'Works with OpenAI-compatible endpoints.'}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <FieldLabel>API Key</FieldLabel>
                <input
                  type="password"
                  value={cfg.apiKey}
                  onChange={e => update('apiKey', e.target.value)}
                  placeholder={provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
                  className="input-base font-mono"
                />
                <p className="mt-2 text-xs text-slate-500">You can skip this and add it later, but AI curation and chat will be limited.</p>
              </div>
              {provider === 'openai' && (
                <div>
                  <FieldLabel>Base URL Optional</FieldLabel>
                  <input
                    value={cfg.baseURL || ''}
                    onChange={e => update('baseURL', e.target.value)}
                    placeholder="https://api.openai.com/v1"
                    className="input-base font-mono text-xs"
                  />
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <FieldLabel>Chat Model</FieldLabel>
                <div className="grid gap-2">
                  {CHAT_MODELS[provider].map(model => (
                    <button
                      key={model.id}
                      onClick={() => { update('chatModel', model.id); update('model', model.id) }}
                      className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                        (cfg.chatModel || cfg.model) === model.id ? 'border-sky-300/70 bg-sky-300/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                      }`}
                    >
                      <div className="text-sm text-slate-100">{model.label}</div>
                      <div className="mt-0.5 text-xs font-mono text-slate-500">{model.id}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <FieldLabel>ASR Provider For Audio / Video Import</FieldLabel>
                <div className="grid grid-cols-2 gap-3">
                  {(['openai', 'aliyun'] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => setCfg(prev => ({
                        ...prev,
                        asrProvider: p,
                        asrModel: ASR_MODELS[p][0].id,
                        asrBaseURL: p === 'aliyun' ? 'https://dashscope.aliyuncs.com' : '',
                      }))}
                      className={`rounded-2xl border px-5 py-4 text-left transition-colors ${
                        asrProvider === p ? 'border-sky-300/70 bg-sky-300/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                      }`}
                    >
                      <div className="text-sm font-semibold text-slate-100">{p === 'openai' ? 'OpenAI Whisper' : 'Aliyun DashScope'}</div>
                      <div className="mt-1 text-xs text-slate-500">{p === 'openai' ? 'Best for local media files.' : 'Best for URL-based Paraformer ASR.'}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <FieldLabel>ASR Model</FieldLabel>
                <select
                  value={cfg.asrModel || ASR_MODELS[asrProvider][0].id}
                  onChange={e => update('asrModel', e.target.value)}
                  className="input-base"
                >
                  {ASR_MODELS[asrProvider].map(model => <option key={model.id} value={model.id}>{model.label}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel>ASR API Key Optional</FieldLabel>
                <input
                  type="password"
                  value={cfg.asrApiKey || ''}
                  onChange={e => update('asrApiKey', e.target.value)}
                  placeholder={asrProvider === 'openai' ? 'reuse main OpenAI key if blank' : 'DashScope API key'}
                  className="input-base font-mono"
                />
              </div>
              <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs leading-relaxed text-slate-500">
                Aliyun Paraformer currently requires HTTP/HTTPS media URLs. Local video transcription uses OpenAI ASR and requires ffmpeg.
              </p>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between">
            <button
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0 || saving}
              className="btn-ghost rounded-full px-5 disabled:opacity-40"
            >
              Back
            </button>
            <div className="flex items-center gap-3">
              {step < 2 && (
                <button onClick={() => setStep(step + 1)} className="btn-primary rounded-full px-6">
                  Continue
                </button>
              )}
              {step === 2 && (
                <button onClick={save} disabled={saving} className="btn-primary rounded-full px-6">
                  {saving ? 'Saving...' : 'Finish setup'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
