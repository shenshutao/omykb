import { useState, useEffect } from 'react'

const DEMO_LINES = [
  { delay: 0,    type: 'prompt',  text: '/kb:init' },
  { delay: 400,  type: 'output',  text: 'OMYKB> Storage backend? [local]' },
  { delay: 800,  type: 'output',  text: 'OMYKB> AI provider? [openai]' },
  { delay: 1200, type: 'success', text: 'OMYKB> Initialized: my-project ✓' },
  { delay: 1800, type: 'prompt',  text: '/kb:add ./architecture.pdf' },
  { delay: 2200, type: 'output',  text: 'OMYKB> Added: Architecture Guide' },
  { delay: 2500, type: 'output',  text: '  Chunks: 24 · Words: 8,420 ✓' },
  { delay: 3200, type: 'prompt',  text: '/kb:ask "How does auth work?"' },
  { delay: 3700, type: 'answer',  text: 'The refresh token flow uses a 7-day' },
  { delay: 4000, type: 'answer',  text: 'sliding window [Source: §3.2]...' },
  { delay: 4400, type: 'cite',    text: 'Sources: Architecture Guide' },
]

export default function TerminalDemo() {
  const [visibleLines, setVisibleLines] = useState(0)

  useEffect(() => {
    const timers = DEMO_LINES.map((line, i) =>
      setTimeout(() => setVisibleLines(i + 1), line.delay)
    )
    // loop
    const reset = setTimeout(() => setVisibleLines(0), 6000)
    return () => { timers.forEach(clearTimeout); clearTimeout(reset) }
  }, [visibleLines === 0 ? undefined : undefined])

  // restart loop
  useEffect(() => {
    if (visibleLines === DEMO_LINES.length) {
      const t = setTimeout(() => setVisibleLines(0), 2500)
      return () => clearTimeout(t)
    }
  }, [visibleLines])

  return (
    <div className="terminal-block p-5 leading-relaxed">
      {/* Title bar */}
      <div className="flex items-center gap-1.5 mb-4">
        <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
        <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
        <div className="w-3 h-3 rounded-full bg-[#28ca41]" />
        <span className="ml-3 text-slate-500 text-xs">claude-code — OMYKB</span>
      </div>

      {/* Lines */}
      <div className="space-y-0.5 min-h-[220px]">
        {DEMO_LINES.slice(0, visibleLines).map((line, i) => (
          <div
            key={i}
            className={`animate-fade-in font-mono text-sm ${
              line.type === 'prompt'  ? 'text-cyan-400' :
              line.type === 'success' ? 'text-green-400' :
              line.type === 'answer'  ? 'text-slate-300' :
              line.type === 'cite'    ? 'text-indigo-400' :
              'text-slate-400'
            }`}
          >
            {line.type === 'prompt' ? (
              <span><span className="text-slate-600">❯ </span>{line.text}</span>
            ) : (
              <span className="pl-2">{line.text}</span>
            )}
          </div>
        ))}
        {/* blinking cursor */}
        <span className="inline-block w-2 h-4 bg-cyan-400 animate-blink ml-2 align-middle" />
      </div>
    </div>
  )
}
