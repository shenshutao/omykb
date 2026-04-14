import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Message, Skill, ToolEvent } from '../types'

// ─── Markdown renderer (no deps) ─────────────────────────────────────────────
function renderMd(text: string): string {
  return text
    .replace(/```([\w]*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hpluoi]|<li|<pre|<block)(.+)$/gm, (m) =>
      m.trim() && !m.startsWith('<') ? `<p>${m}</p>` : m
    )
}

// ─── Tool badge ───────────────────────────────────────────────────────────────
const TOOL_ICONS: Record<string, string> = {
  list_documents: '📋', read_document: '📄',
  search_documents: '🔍', write_document: '✍️', fetch_url: '🌐',
  crawl_site: '🕸️', read_local_file: '📁', read_git_repository: '🧬', ingest_source: '🧠',
}

function ToolBadge({ event }: { event: ToolEvent }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-[#21262d] text-slate-400 rounded px-2 py-0.5 font-mono">
      {TOOL_ICONS[event.name] || '⚙️'} {event.name}
    </span>
  )
}

// ─── Skill badge ──────────────────────────────────────────────────────────────
function SkillBadge({ skill }: { skill: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-violet-500/10 text-violet-300 border border-violet-500/20 rounded px-2 py-0.5 font-mono">
      ✦ {skill}
    </span>
  )
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg }: { msg: Message }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[75%] bg-indigo-600/20 border border-indigo-500/30 rounded-2xl rounded-tr-sm px-4 py-3 text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">
          {msg.content}
        </div>
      </div>
    )
  }
  return (
    <div className="flex gap-3 mb-4">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">K</div>
      <div className="flex-1 min-w-0">
        {msg.activeSkill && (
          <div className="mb-2"><SkillBadge skill={msg.activeSkill} /></div>
        )}
        {msg.toolEvents && msg.toolEvents.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {msg.toolEvents.map((ev, i) => <ToolBadge key={i} event={ev} />)}
          </div>
        )}
        <div className="prose-kb text-sm text-slate-300" dangerouslySetInnerHTML={{ __html: renderMd(msg.content) }} />
        {msg.usage && (
          <div className="mt-2 text-xs text-slate-600">{msg.usage.inputTokens}↑ {msg.usage.outputTokens}↓ tokens</div>
        )}
      </div>
    </div>
  )
}

function StreamingBubble({ text, toolEvents, activeSkill }: { text: string; toolEvents: ToolEvent[]; activeSkill?: string }) {
  return (
    <div className="flex gap-3 mb-4">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">K</div>
      <div className="flex-1 min-w-0">
        {activeSkill && <div className="mb-2"><SkillBadge skill={activeSkill} /></div>}
        {toolEvents.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {toolEvents.map((ev, i) => <ToolBadge key={i} event={ev} />)}
          </div>
        )}
        {text
          ? <div className="prose-kb text-sm text-slate-300" dangerouslySetInnerHTML={{ __html: renderMd(text) }} />
          : <div className="flex items-center gap-1.5 text-slate-500 text-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:300ms]" />
            </div>
        }
        <span className="cursor-blink text-indigo-400">▌</span>
      </div>
    </div>
  )
}

// ─── Slash command picker ─────────────────────────────────────────────────────
function SlashPicker({
  skills, query, onSelect, onClose, anchorRef,
}: {
  skills: Skill[]
  query: string
  onSelect: (skill: Skill) => void
  onClose: () => void
  anchorRef: React.RefObject<HTMLTextAreaElement>
}) {
  const filtered = skills.filter(s =>
    s.command.toLowerCase().includes(query.toLowerCase()) ||
    s.description.toLowerCase().includes(query.toLowerCase())
  )
  const [activeIdx, setActiveIdx] = useState(0)

  useEffect(() => { setActiveIdx(0) }, [query])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
      if (e.key === 'Enter' && filtered[activeIdx]) { e.preventDefault(); onSelect(filtered[activeIdx]) }
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [filtered, activeIdx, onSelect, onClose])

  if (filtered.length === 0) return null

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl overflow-hidden z-50 max-h-72 overflow-y-auto scrollbar-thin">
      <div className="px-3 py-2 border-b border-[#21262d] flex items-center gap-2">
        <span className="text-xs text-slate-500">Skills</span>
        <span className="text-xs text-slate-700">↑↓ navigate · Enter select · Esc dismiss</span>
      </div>
      {filtered.map((skill, idx) => (
        <button
          key={skill.name}
          onClick={() => onSelect(skill)}
          className={`w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors ${idx === activeIdx ? 'bg-indigo-500/10' : 'hover:bg-[#21262d]'}`}
        >
          <span className="text-violet-400 font-mono text-sm mt-0.5 flex-shrink-0">✦</span>
          <div className="min-w-0">
            <div className="text-sm font-mono text-violet-300">{skill.command}</div>
            {skill.description && (
              <div className="text-xs text-slate-500 mt-0.5 truncate">{skill.description}</div>
            )}
          </div>
        </button>
      ))}
    </div>
  )
}

// ─── Main Chat component ──────────────────────────────────────────────────────
export default function Chat({ embedded = false }: { embedded?: boolean }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [streamTools, setStreamTools] = useState<ToolEvent[]>([])
  const [streamSkill, setStreamSkill] = useState<string | undefined>()
  const [skills, setSkills] = useState<Skill[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const [activeSkill, setActiveSkill] = useState<string | undefined>()  // skill injected for next message
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Load skills
  useEffect(() => {
    window.omykb.listSkills().then(setSkills).catch(() => {})
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamText])

  // Detect "/" trigger in textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setInput(val)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`

    // Show picker when input starts with /
    const slashMatch = val.match(/^\/(\S*)$/)
    if (slashMatch) {
      setPickerQuery(slashMatch[1])
      setShowPicker(true)
    } else {
      setShowPicker(false)
    }
  }

  const selectSkill = useCallback(async (skill: Skill) => {
    setShowPicker(false)
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    // Load full skill content
    const full = await window.omykb.getSkill(skill.name)
    if (full) {
      setActiveSkill(skill.command)
      // Show an indicator in input area
      textareaRef.current?.focus()
    }
  }, [])

  const clearSkill = () => setActiveSkill(undefined)

  const send = useCallback(async () => {
    const text = input.trim()
    if ((!text && !activeSkill) || streaming) return

    let userContent = text
    let skillContent: string | undefined

    // If a skill is active, load its content to inject
    if (activeSkill) {
      const full = await window.omykb.getSkill(activeSkill)
      skillContent = full?.content
    }

    // Build the message content — skill instructions prefix the user's text
    const messageContent = skillContent
      ? `[Skill: ${activeSkill}]\n\n${skillContent}${text ? `\n\n---\nUser input: ${text}` : ''}`
      : text

    // Display user message (without the raw skill dump for readability)
    const displayContent = activeSkill
      ? `${activeSkill}${text ? ` — ${text}` : ''}`
      : text

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: displayContent,
    }

    const currentSkill = activeSkill
    const history = [...messages, userMsg]
    setMessages(history)
    setInput('')
    setActiveSkill(undefined)
    setStreaming(true)
    setStreamText('')
    setStreamTools([])
    setStreamSkill(currentSkill)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    let accumulated = ''
    const currentTools: ToolEvent[] = []

    const offChunk = window.omykb.onStreamChunk(chunk => {
      accumulated += chunk
      setStreamText(accumulated)
    })
    const offTool = window.omykb.onToolUse(tool => {
      if (tool.input !== null) { currentTools.push(tool); setStreamTools([...currentTools]) }
    })
    const offDone = window.omykb.onStreamDone(usage => {
      setMessages(prev => [...prev, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: accumulated,
        toolEvents: currentTools.length ? [...currentTools] : undefined,
        activeSkill: currentSkill,
        usage,
      }])
      setStreaming(false); setStreamText(''); setStreamTools([]); setStreamSkill(undefined)
      cleanup()
    })
    const offError = window.omykb.onStreamError(error => {
      setMessages(prev => [...prev, { id: `e-${Date.now()}`, role: 'assistant', content: `Error: ${error}` }])
      setStreaming(false); setStreamText(''); setStreamTools([]); setStreamSkill(undefined)
      cleanup()
    })
    const cleanup = () => { offChunk(); offTool(); offDone(); offError() }

    // Send actual messages with skill content injected into last user message
    const apiMessages = history.map((m, i) =>
      i === history.length - 1
        ? { role: m.role, content: messageContent }
        : { role: m.role, content: m.content }
    )
    await window.omykb.sendMessage(apiMessages)
  }, [input, streaming, messages, activeSkill])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showPicker && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter')) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
    if (e.key === 'Escape' && showPicker) {
      setShowPicker(false)
    }
  }

  const SUGGESTIONS = [
    'What topics are in my knowledge base?',
    'Summarize my most recent notes',
    'Find anything about AI or machine learning',
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      {!embedded && (
        <div className="px-6 py-4 border-b border-[#21262d] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-sm font-bold">K</div>
            <div>
              <div className="text-sm font-semibold text-slate-200">Knowledge Assistant</div>
              <div className="text-xs text-slate-500">Powered by Claude · type <kbd className="font-mono bg-[#21262d] px-1 rounded">/</kbd> for skills</div>
            </div>
          </div>
          {skills.length > 0 && (
            <div className="text-xs text-slate-600">{skills.length} skill{skills.length !== 1 ? 's' : ''} loaded</div>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-4">
        {messages.length === 0 && !streaming && (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 flex items-center justify-center mb-4">
              <span className="text-3xl">🧠</span>
            </div>
            <h2 className="text-lg font-semibold text-slate-200 mb-2">Your Knowledge Base</h2>
            <p className="text-slate-500 text-sm max-w-sm mb-6">
              Ask anything, or type <span className="font-mono text-violet-400">/</span> to use a skill.
            </p>
            <div className="grid gap-2 w-full max-w-sm mb-4">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => { setInput(s); textareaRef.current?.focus() }}
                  className="text-left px-4 py-2.5 rounded-lg border border-[#21262d] hover:border-indigo-500/40 text-slate-400 hover:text-slate-300 text-sm transition-colors">
                  {s}
                </button>
              ))}
            </div>
            {skills.length > 0 && (
              <div className="w-full max-w-sm">
                <div className="text-xs text-slate-600 mb-2">Available skills</div>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {skills.slice(0, 8).map(s => (
                    <button key={s.name} onClick={() => selectSkill(s)}
                      className="font-mono text-xs text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-1 rounded hover:bg-violet-500/20 transition-colors">
                      {s.command}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
        {streaming && <StreamingBubble text={streamText} toolEvents={streamTools} activeSkill={streamSkill} />}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="px-6 py-4 border-t border-[#21262d]">
        {/* Active skill indicator */}
        {activeSkill && (
          <div className="flex items-center gap-2 mb-2 px-1">
            <SkillBadge skill={activeSkill} />
            <span className="text-xs text-slate-500">active — add an optional message or press Enter to run</span>
            <button onClick={clearSkill} className="ml-auto text-slate-600 hover:text-slate-400 text-xs">✕</button>
          </div>
        )}

        <div className="relative">
          {showPicker && (
            <SlashPicker
              skills={skills}
              query={pickerQuery}
              onSelect={selectSkill}
              onClose={() => setShowPicker(false)}
              anchorRef={textareaRef}
            />
          )}
          <div className="flex items-end gap-3 bg-[#161b22] border border-[#21262d] rounded-xl px-4 py-3 focus-within:border-indigo-500/60 transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder={activeSkill ? 'Optional message… (Enter to run skill)' : 'Ask your knowledge base… or type / for skills'}
              rows={1}
              className="flex-1 bg-transparent text-slate-200 text-sm placeholder-slate-500 resize-none focus:outline-none leading-relaxed"
              style={{ minHeight: '24px', maxHeight: '160px' }}
            />
            <button onClick={send} disabled={(!input.trim() && !activeSkill) || streaming}
              className="btn-primary flex-shrink-0 flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
