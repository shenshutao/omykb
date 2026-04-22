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

const ASR_PROVIDERS: Array<{ id: NonNullable<KBConfig['asrProvider']>; label: string; description: string }> = [
  { id: 'openai',       label: 'OpenAI Whisper',       description: 'File-based transcription via Whisper. Sends 8-second chunks after capture.' },
  { id: 'aliyun',       label: 'Aliyun DashScope',     description: 'Real-time streaming via DashScope WebSocket. Supports fun-asr-realtime and paraformer-realtime models.' },
  { id: 'funasr-local', label: 'FunASR Local (Docker)', description: 'Self-hosted real-time ASR — fully offline, no API key needed. Speaker diarization built into results. Requires Docker.' },
]

const ASR_MODELS: Record<NonNullable<KBConfig['asrProvider']>, Array<{ id: string; label: string }>> = {
  openai: [
    { id: 'whisper-1', label: 'Whisper 1' },
  ],
  aliyun: [
    { id: 'fun-asr-realtime',         label: 'FunASR Realtime (Recommended)' },
    { id: 'paraformer-realtime-v2',   label: 'Paraformer Realtime v2' },
    { id: 'paraformer-realtime-v1',   label: 'Paraformer Realtime v1' },
    { id: 'paraformer-realtime-8k-v2',label: 'Paraformer Realtime 8k v2' },
    { id: 'gummy-realtime-v1',        label: 'Gummy Realtime v1' },
  ],
  'funasr-local': [
    { id: '2pass',   label: '2pass — online partial + offline final (Recommended)' },
    { id: 'offline', label: 'offline — full accuracy, higher latency' },
    { id: 'online',  label: 'online — low latency, lower accuracy' },
  ],
}

// Compact inline model row used inside the Models card
function ModelRow({
  label, hint, value, fallback, models, onChange,
}: {
  label: string; hint: string; value: string; fallback: string
  models: Array<{ id: string; label: string }>; onChange: (v: string) => void
}) {
  const isCustom = Boolean(value && !models.some(m => m.id === value))
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-white/[0.05] last:border-0">
      <span className="w-[72px] flex-shrink-0 text-xs text-slate-400 pt-[7px]">{label}</span>
      <div className="flex-1 min-w-0">
        <select
          value={isCustom ? '__custom__' : (value || fallback)}
          onChange={e => { if (e.target.value !== '__custom__') onChange(e.target.value) }}
          className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-2.5 py-[7px] text-xs text-slate-200 outline-none focus:border-indigo-400/50 cursor-pointer"
        >
          {models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          <option value="__custom__">Custom model ID…</option>
        </select>
        {isCustom && (
          <input type="text" value={value} onChange={e => onChange(e.target.value)}
            placeholder={fallback}
            className="mt-1.5 w-full bg-[#0d1117] border border-white/10 rounded-lg px-2.5 py-[7px] text-xs text-slate-200 font-mono outline-none focus:border-indigo-400/50" />
        )}
      </div>
      <button title={hint} className="flex-shrink-0 mt-[7px] text-slate-700 hover:text-slate-400 transition-colors">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
        </svg>
      </button>
    </div>
  )
}

// ── FunASR Local setup guide ──────────────────────────────────────────────────
const FUNASR_IMAGE     = 'registry.cn-hangzhou.aliyuncs.com/funasr_repo/funasr:funasr-runtime-sdk-online-cpu-0.1.13'
const FUNASR_IMAGE_GPU = 'registry.cn-hangzhou.aliyuncs.com/funasr_repo/funasr:funasr-runtime-sdk-online-gpu-0.1.13'
const SERVER_CMD       = `bash -c "cd /workspace/FunASR/runtime && bash run_server_2pass.sh --certfile 0"`

// Basic: start container + auto-launch server in one command
const DOCKER_CMD_BASIC = `docker run -p 10096:10095 -d --privileged=true \\
  -v $PWD/funasr-models:/workspace/models \\
  ${FUNASR_IMAGE} \\
  ${SERVER_CMD}`

// With speaker diarization
const DOCKER_CMD_SV = `docker run -p 10096:10095 -d --privileged=true \\
  -v $PWD/funasr-models:/workspace/models \\
  ${FUNASR_IMAGE} \\
  bash -c "cd /workspace/FunASR/runtime && bash run_server_2pass.sh --certfile 0 --sv-dir damo/speech_campplus_sv_zh-cn_16k-common"`

// GPU
const DOCKER_CMD_GPU = `docker run -p 10096:10095 -d --privileged=true --gpus all \\
  -v $PWD/funasr-models:/workspace/models \\
  ${FUNASR_IMAGE_GPU} \\
  bash -c "cd /workspace/FunASR/runtime && bash run_server_2pass.sh --certfile 0 --sv-dir damo/speech_campplus_sv_zh-cn_16k-common"`

function FunASRSetupGuide() {
  const [open, setOpen] = useState(false)
  const copy = (text: string) => navigator.clipboard?.writeText(text)

  return (
    <section className="card p-5">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Setup Guide</h2>
          <p className="text-xs text-slate-500 mt-0.5">How to deploy FunASR locally with Docker</p>
        </div>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="mt-4 space-y-4 text-xs text-slate-400">
          {/* Step 1 */}
          <div>
            <p className="font-medium text-slate-300 mb-1">① Install Docker</p>
            <p>Download from <span className="text-indigo-400">docker.com</span> and make sure the Docker daemon is running.</p>
          </div>

          {/* Step 2 */}
          <div>
            <p className="font-medium text-slate-300 mb-1">② Start the FunASR server</p>
            <p className="mb-2">
              Run this command in Terminal. Models (~2 GB) are downloaded automatically on first launch
              and cached in <code className="text-slate-300">./funasr-models</code>.
            </p>
            <CodeBlock text={DOCKER_CMD_BASIC} onCopy={copy} />
            <p className="mt-2 text-slate-500">
              The server listens on container port 10095, exposed on host port <strong className="text-slate-300">10096</strong>.
            </p>
          </div>

          {/* Step 3 */}
          <div>
            <p className="font-medium text-slate-300 mb-1">③ Connect OMYKB</p>
            <p>
              Set the WebSocket URL to <code className="text-indigo-400">ws://localhost:10096</code> above and click Save.
            </p>
          </div>

          {/* Speaker diarization */}
          <div className="rounded-xl border border-indigo-400/20 bg-indigo-400/5 px-4 py-3">
            <p className="font-medium text-indigo-300 mb-1">Speaker diarization — zero extra cost, no OSS needed</p>
            <p className="mb-2">
              Add <code className="text-indigo-200">-e sv=true</code> to enable the speaker verification model.
              Each final transcript segment will include a speaker label (Speaker A, B, C…) automatically:
            </p>
            <CodeBlock text={DOCKER_CMD_SV} onCopy={copy} />
          </div>

          {/* GPU */}
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3">
            <p className="font-medium text-amber-300 mb-1">GPU acceleration (NVIDIA, optional)</p>
            <p className="mb-2">
              Switch to the GPU image and add <code className="text-amber-200">--gpus all</code> — noticeably faster for long sessions:
            </p>
            <CodeBlock text={DOCKER_CMD_GPU} onCopy={copy} />
          </div>

          <p className="text-slate-600">
            Docs:{' '}
            <span className="text-indigo-400 break-all">
              github.com/modelscope/FunASR → runtime/docs/SDK_advanced_guide_online_zh.md
            </span>
          </p>
        </div>
      )}
    </section>
  )
}

function CodeBlock({ text, onCopy }: { text: string; onCopy: (t: string) => void }) {
  return (
    <div className="relative group">
      <pre className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 font-mono text-[11px] leading-relaxed overflow-x-auto whitespace-pre-wrap break-all">
        {text}
      </pre>
      <button
        onClick={() => onCopy(text)}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity btn-ghost px-2 py-1 text-[10px]"
      >
        Copy
      </button>
    </div>
  )
}

// ── LLM & API ────────────────────────────────────────────────────────────────
function EyeIcon({ visible }: { visible: boolean }) {
  return visible ? (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

function LLMPage({ cfg, update, switchProvider, save, saved }: {
  cfg: KBConfig
  update: <K extends keyof KBConfig>(k: K, v: KBConfig[K]) => void
  switchProvider: (p: KBConfig['provider']) => void
  save: () => void
  saved: boolean
}) {
  const [apiKeyVisible, setApiKeyVisible] = useState(false)
  const [asrKeyVisible, setAsrKeyVisible] = useState(false)
  const [ossExpanded, setOssExpanded] = useState(false)
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [testMsg, setTestMsg] = useState('')
  const [asrTestState, setAsrTestState] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [asrTestMsg, setAsrTestMsg] = useState('')
  const provider = cfg.provider || 'anthropic'
  const chatModel = cfg.chatModel || cfg.model || MODELS[provider][0].id
  const asrProvider = cfg.asrProvider || 'openai'

  const testLLM = async () => {
    setTestState('testing')
    setTestMsg('')
    const res = await window.omykb.testLLM()
    if (res.error) { setTestState('error'); setTestMsg(res.error) }
    else { setTestState('ok'); setTestMsg(`${res.model}  ·  ${res.latency}ms`) }
  }

  const testASR = async () => {
    setAsrTestState('testing')
    setAsrTestMsg('')
    const res = await window.omykb.testASR()
    if (res.error) { setAsrTestState('error'); setAsrTestMsg(res.error) }
    else { setAsrTestState('ok'); setAsrTestMsg(`${res.model}  ·  ${res.latency}ms`) }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-xl mx-auto px-6 py-6 space-y-3">

          {/* ── LLM ─────────────────────────────────────── */}
          <section className="card p-5 space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">LLM</h2>

            {/* Provider toggle */}
            <div className="flex gap-2">
              {PROVIDERS.map(p => (
                <button key={p.id} onClick={() => switchProvider(p.id)}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    provider === p.id
                      ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                      : 'border-[#21262d] text-slate-400 hover:border-[#30363d] hover:text-slate-300'
                  }`}
                >
                  <span>{p.icon}</span>{p.label}
                </button>
              ))}
            </div>

            {/* API Key */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-slate-400">API Key</label>
                <span className="text-[10px] text-slate-600">
                  {provider === 'anthropic' ? 'console.anthropic.com' : 'platform.openai.com'}
                </span>
              </div>
              <div className="flex gap-2">
                <input type={apiKeyVisible ? 'text' : 'password'} value={cfg.apiKey}
                  onChange={e => update('apiKey', e.target.value)}
                  placeholder={provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
                  className="input-base flex-1 font-mono text-xs" />
                <button onClick={() => setApiKeyVisible(v => !v)} className="btn-ghost px-3 text-slate-500">
                  <EyeIcon visible={apiKeyVisible} />
                </button>
              </div>
              <div className="mt-2 flex items-center gap-3">
              {cfg.apiKey && <p className="text-[11px] text-emerald-500">✓ configured</p>}
              <button
                onClick={testLLM}
                disabled={!cfg.apiKey || testState === 'testing'}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-slate-400 hover:border-indigo-400/40 hover:text-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {testState === 'testing' ? (
                  <><span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />Testing…</>
                ) : (
                  <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                  </svg>Test connection</>
                )}
              </button>
            </div>
            {testState === 'ok' && (
              <p className="text-[11px] text-emerald-400 flex items-center gap-1.5 mt-1">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                {testMsg}
              </p>
            )}
            {testState === 'error' && (
              <p className="text-[11px] text-red-400 mt-1 break-all">{testMsg}</p>
            )}
            </div>

            {/* Base URL — OpenAI only */}
            {provider === 'openai' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-slate-400">Base URL <span className="text-slate-600">(optional)</span></label>
                  <span className="text-[10px] text-slate-600">Ollama, Azure, LM Studio…</span>
                </div>
                <input type="text" value={cfg.baseURL || ''}
                  onChange={e => update('baseURL', e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  className="input-base font-mono text-xs" />
              </div>
            )}
          </section>

          {/* ── Models ──────────────────────────────────── */}
          <section className="card px-5 py-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1">Models</h2>
            <ModelRow label="Chat"      hint="Used for grounded chat with your knowledge base."
              value={chatModel} fallback={MODELS[provider][0].id} models={MODELS[provider]}
              onChange={v => { update('chatModel', v); update('model', v) }} />
            <ModelRow label="Ingestion" hint="Orchestrates parser tools during import. Defaults to Chat model."
              value={cfg.ingestionModel || chatModel} fallback={chatModel} models={MODELS[provider]}
              onChange={v => update('ingestionModel', v)} />
            <ModelRow label="Curation"  hint="Turns raw extracted content into clean Markdown notes."
              value={cfg.curationModel || chatModel} fallback={chatModel} models={MODELS[provider]}
              onChange={v => update('curationModel', v)} />
            <ModelRow label="Vision"    hint="Image understanding: screenshots, diagrams, scanned visuals."
              value={cfg.visionModel || chatModel} fallback={chatModel} models={MODELS[provider]}
              onChange={v => update('visionModel', v)} />
          </section>

          {/* ── ASR ─────────────────────────────────────── */}
          <section className="card p-5 space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">ASR — Speech Recognition</h2>

            {/* Provider pills */}
            <div className="flex gap-1.5 flex-wrap">
              {ASR_PROVIDERS.map(p => (
                <button key={p.id}
                  onClick={() => {
                    update('asrProvider', p.id)
                    update('asrModel', ASR_MODELS[p.id][0].id)
                    update('asrBaseURL',
                      p.id === 'aliyun'       ? 'https://dashscope-intl.aliyuncs.com' :
                      p.id === 'funasr-local' ? 'ws://localhost:10096' : '')
                  }}
                  title={p.description}
                  className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                    asrProvider === p.id
                      ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                      : 'border-[#21262d] text-slate-500 hover:border-[#30363d] hover:text-slate-300'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-600 -mt-2">
              {ASR_PROVIDERS.find(p => p.id === asrProvider)?.description}
            </p>

            {/* API Key — hidden for funasr-local */}
            {asrProvider !== 'funasr-local' && (
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">
                  {asrProvider === 'aliyun' ? 'DashScope API Key' : 'Whisper API Key'}
                  {asrProvider === 'openai' && <span className="text-slate-600"> (blank = reuse main key)</span>}
                </label>
                <div className="flex gap-2">
                  <input type={asrKeyVisible ? 'text' : 'password'} value={cfg.asrApiKey || ''}
                    onChange={e => update('asrApiKey', e.target.value)}
                    placeholder={asrProvider === 'aliyun' ? 'sk-...' : 'leave blank to reuse main key'}
                    className="input-base flex-1 font-mono text-xs" />
                  <button onClick={() => setAsrKeyVisible(v => !v)} className="btn-ghost px-3 text-slate-500">
                    <EyeIcon visible={asrKeyVisible} />
                  </button>
                </div>
              </div>
            )}

            {/* Aliyun endpoint */}
            {asrProvider === 'aliyun' && (
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Real-Time Endpoint</label>
                <input type="text"
                  value={cfg.asrBaseURL || 'https://dashscope-intl.aliyuncs.com'}
                  onChange={e => update('asrBaseURL', e.target.value)}
                  placeholder="https://dashscope-intl.aliyuncs.com"
                  className="input-base font-mono text-xs" />
              </div>
            )}

            {/* FunASR WebSocket URL */}
            {asrProvider === 'funasr-local' && (
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">WebSocket URL</label>
                <input type="text"
                  value={cfg.asrBaseURL || 'ws://localhost:10096'}
                  onChange={e => update('asrBaseURL', e.target.value)}
                  placeholder="ws://localhost:10096"
                  className="input-base font-mono text-xs" />
              </div>
            )}

            {/* ASR Model / Mode row */}
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">
                {asrProvider === 'funasr-local' ? 'Recognition Mode' : 'Model'}
              </label>
              <ModelRow
                label="" hint={
                  asrProvider === 'funasr-local'
                    ? '2pass: online partial → offline final (recommended). Offline results include spk_label when server started with -e sv=true.'
                    : asrProvider === 'aliyun' ? 'Aliyun real-time recognition model.' : 'OpenAI Whisper model.'
                }
                value={cfg.asrModel || ASR_MODELS[asrProvider][0].id}
                fallback={ASR_MODELS[asrProvider][0].id}
                models={ASR_MODELS[asrProvider]}
                onChange={v => update('asrModel', v)}
              />
            </div>

            {/* Test ASR connection */}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={testASR}
                disabled={asrTestState === 'testing' || (asrProvider !== 'funasr-local' && !cfg.asrApiKey && !cfg.apiKey)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-slate-400 hover:border-indigo-400/40 hover:text-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {asrTestState === 'testing' ? (
                  <><span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />Testing…</>
                ) : (
                  <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                  </svg>Test connection</>
                )}
              </button>
              {asrTestState === 'ok' && (
                <span className="text-[11px] text-emerald-400 flex items-center gap-1.5">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  {asrTestMsg}
                </span>
              )}
              {asrTestState === 'error' && (
                <span className="text-[11px] text-red-400 break-all">{asrTestMsg}</span>
              )}
            </div>

            {/* Aliyun advanced: diarize endpoint + OSS */}
            {asrProvider === 'aliyun' && (
              <div>
                <button onClick={() => setOssExpanded(v => !v)}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    className={`transition-transform ${ossExpanded ? 'rotate-90' : ''}`}>
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                  Advanced: Speaker Diarization &amp; OSS
                </button>
                {ossExpanded && (
                  <div className="mt-3 space-y-3 pl-4 border-l border-white/[0.06]">
                    <div>
                      <label className="text-xs text-slate-500 block mb-1.5">
                        Diarization Endpoint <span className="text-slate-700">(blank = same as real-time)</span>
                      </label>
                      <input type="text" value={cfg.diarizeBaseURL || ''}
                        onChange={e => update('diarizeBaseURL', e.target.value)}
                        placeholder={cfg.asrBaseURL || 'https://dashscope-intl.aliyuncs.com'}
                        className="input-base font-mono text-xs" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1.5">
                        OSS Storage <span className="text-slate-700">(required for diarization)</span>
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <input type="text" placeholder="Region  e.g. oss-ap-southeast-1"
                          value={cfg.ossRegion || ''} onChange={e => update('ossRegion', e.target.value)}
                          className="input-base font-mono text-xs" />
                        <input type="text" placeholder="Bucket"
                          value={cfg.ossBucket || ''} onChange={e => update('ossBucket', e.target.value)}
                          className="input-base font-mono text-xs" />
                        <input type="text" placeholder="AccessKey ID"
                          value={cfg.ossAccessKeyId || ''} onChange={e => update('ossAccessKeyId', e.target.value)}
                          className="input-base font-mono text-xs" />
                        <input type="password" placeholder="AccessKey Secret"
                          value={cfg.ossAccessKeySecret || ''} onChange={e => update('ossAccessKeySecret', e.target.value)}
                          className="input-base font-mono text-xs" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* FunASR setup guide */}
            {asrProvider === 'funasr-local' && <FunASRSetupGuide />}
          </section>

        </div>
      </div>
      <div className="border-t border-[#21262d] px-6 py-3 flex items-center gap-3">
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
    window.omykb.getConfig().then(c => setCfg({
      provider: 'anthropic',
      model: 'claude-opus-4-6',
      chatModel: c.chatModel || c.model || 'claude-opus-4-6',
      ingestionModel: c.ingestionModel || '',
      curationModel: c.curationModel || '',
      visionModel: c.visionModel || '',
      asrProvider: c.asrProvider || 'openai',
      asrApiKey: c.asrApiKey || '',
      asrModel: c.asrModel || 'whisper-1',
      asrBaseURL: c.asrBaseURL || '',
      baseURL: '',
      ...c,
    }))
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
    const model = MODELS[provider][0].id
    setCfg(prev => ({
      ...prev!,
      provider,
      model,
      chatModel: model,
      ingestionModel: '',
      curationModel: '',
      visionModel: '',
      apiKey: '',
      baseURL: '',
    }))
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
