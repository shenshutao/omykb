import React, { useState, useRef, useEffect, useCallback } from 'react'

type RecordingState = 'idle' | 'recording' | 'stopped'

interface Segment {
  id: string
  startSec: number
  original: string
  translation?: string
  translating: boolean
  pending: boolean
}

interface Summary {
  id: string
  startSec: number
  content: string
  pending: boolean
}

const LANGUAGES = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'ru', label: 'Русский' },
]

const CHUNK_INTERVAL_MS = 8000
const SUMMARY_EVERY_N_SEGMENTS = 6

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function WaveformBars({ data, active }: { data: number[]; active: boolean }) {
  return (
    <div className="flex items-end justify-center gap-[2px] h-10 w-48">
      {data.map((v, i) => (
        <div
          key={i}
          className={`flex-1 rounded-full transition-all duration-75 ${
            active ? 'bg-gradient-to-t from-indigo-500 to-amber-400' : 'bg-white/10'
          }`}
          style={{ height: active ? `${Math.max(3, (v / 255) * 40)}px` : '3px' }}
        />
      ))}
    </div>
  )
}

export default function AudioRecorder({
  workspaceId,
  onBack,
  onSaved,
}: {
  workspaceId: string
  onBack: () => void
  onSaved: () => void
}) {
  const [recState, setRecState] = useState<RecordingState>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [segments, setSegments] = useState<Segment[]>([])
  const [summaries, setSummaries] = useState<Summary[]>([])
  const [waveData, setWaveData] = useState<number[]>(new Array(32).fill(0))
  const [translateEnabled, setTranslateEnabled] = useState(false)
  const [targetLang, setTargetLang] = useState('en')
  const [saveTitle, setSaveTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [permError, setPermError] = useState('')

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const animFrameRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const chunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sessionStartRef = useRef(0)
  const elapsedRef = useRef(0)
  const isRecordingRef = useRef(false)
  const segmentsSinceLastSummaryRef = useRef(0)
  const segmentsRef = useRef<Segment[]>([])
  const translateEnabledRef = useRef(false)
  const targetLangRef = useRef('en')
  const transcriptEndRef = useRef<HTMLDivElement>(null)
  const summaryEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { segmentsRef.current = segments }, [segments])
  useEffect(() => { translateEnabledRef.current = translateEnabled }, [translateEnabled])
  useEffect(() => { targetLangRef.current = targetLang }, [targetLang])

  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [segments])

  useEffect(() => {
    if (summaryEndRef.current) {
      summaryEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [summaries])

  const drawWaveform = useCallback(() => {
    if (!analyserRef.current) return
    const buf = new Uint8Array(analyserRef.current.frequencyBinCount)
    analyserRef.current.getByteFrequencyData(buf)
    const bars = 32
    const step = Math.max(1, Math.floor(buf.length / bars))
    const values = Array.from({ length: bars }, (_, i) => {
      const slice = buf.slice(i * step, (i + 1) * step)
      return Math.round(Array.from(slice).reduce((a, b) => a + b, 0) / slice.length)
    })
    setWaveData(values)
    animFrameRef.current = requestAnimationFrame(drawWaveform)
  }, [])

  const triggerSummary = useCallback(async (endSec: number) => {
    const recent = segmentsRef.current
      .filter(s => !s.pending && s.original.trim())
      .slice(-SUMMARY_EVERY_N_SEGMENTS)
      .map(s => s.original)

    if (recent.length === 0) return

    const sumId = `sum_${Date.now()}`
    setSummaries(prev => [...prev, { id: sumId, startSec: endSec, content: '', pending: true }])

    const result = await window.omykb.recorder.summarize(recent)
    setSummaries(prev => prev.map(s =>
      s.id === sumId
        ? { ...s, content: result.text ?? '[summary failed]', pending: false }
        : s
    ))
  }, [])

  const processChunk = useCallback(async (blob: Blob, segStartSec: number) => {
    if (blob.size < 1500) return

    const segId = `seg_${Date.now()}_${Math.random().toString(36).slice(2)}`
    setSegments(prev => [...prev, { id: segId, startSec: segStartSec, original: '', translating: false, pending: true }])

    try {
      const ab = await blob.arrayBuffer()
      const result = await window.omykb.recorder.transcribeChunk(Array.from(new Uint8Array(ab)), 'webm')

      if (result.error) {
        setSegments(prev => prev.map(s =>
          s.id === segId ? { ...s, original: `⚠ ${result.error}`, pending: false } : s
        ))
        return
      }

      if (!result.text?.trim()) {
        setSegments(prev => prev.filter(s => s.id !== segId))
        return
      }

      setSegments(prev => prev.map(s =>
        s.id === segId ? { ...s, original: result.text!, pending: false } : s
      ))

      segmentsSinceLastSummaryRef.current++
      if (segmentsSinceLastSummaryRef.current >= SUMMARY_EVERY_N_SEGMENTS) {
        segmentsSinceLastSummaryRef.current = 0
        triggerSummary(segStartSec)
      }

      if (translateEnabledRef.current && result.text) {
        setSegments(prev => prev.map(s => s.id === segId ? { ...s, translating: true } : s))
        const trans = await window.omykb.recorder.translate(result.text!, targetLangRef.current)
        setSegments(prev => prev.map(s =>
          s.id === segId ? { ...s, translation: trans.text, translating: false } : s
        ))
      }
    } catch {
      setSegments(prev => prev.map(s =>
        s.id === segId ? { ...s, original: '[transcription error]', pending: false } : s
      ))
    }
  }, [triggerSummary])

  const startSegment = useCallback((stream: MediaStream) => {
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'
    const segStartSec = elapsedRef.current
    const localChunks: Blob[] = []
    const rec = new MediaRecorder(stream, { mimeType })

    rec.ondataavailable = (e) => { if (e.data.size > 0) localChunks.push(e.data) }
    rec.onstop = () => {
      const blob = new Blob(localChunks, { type: mimeType })
      processChunk(blob, segStartSec)
    }
    rec.start(200)
    recorderRef.current = rec
  }, [processChunk])

  const start = useCallback(async () => {
    setPermError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      streamRef.current = stream

      const ctx = new AudioContext()
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      audioCtxRef.current = ctx
      analyserRef.current = analyser

      sessionStartRef.current = Date.now() - elapsedRef.current * 1000
      isRecordingRef.current = true
      setRecState('recording')

      drawWaveform()

      timerRef.current = setInterval(() => {
        elapsedRef.current = Math.floor((Date.now() - sessionStartRef.current) / 1000)
        setElapsed(elapsedRef.current)
      }, 500)

      startSegment(stream)

      chunkTimerRef.current = setInterval(() => {
        if (!isRecordingRef.current || !streamRef.current) return
        if (recorderRef.current?.state === 'recording') {
          recorderRef.current.stop()
        }
        setTimeout(() => {
          if (isRecordingRef.current && streamRef.current) {
            startSegment(streamRef.current)
          }
        }, 250)
      }, CHUNK_INTERVAL_MS)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setPermError(msg.includes('Permission') || msg.includes('NotAllowed')
        ? 'Microphone access denied. Allow access in System Settings → Privacy → Microphone.'
        : msg)
    }
  }, [drawWaveform, startSegment])

  const stop = useCallback(() => {
    isRecordingRef.current = false

    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (chunkTimerRef.current) { clearInterval(chunkTimerRef.current); chunkTimerRef.current = null }
    cancelAnimationFrame(animFrameRef.current)

    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop()
    }
    streamRef.current?.getTracks().forEach(t => t.stop())
    audioCtxRef.current?.close()

    setWaveData(new Array(32).fill(0))
    setRecState('stopped')

    // Final summary if there are unsummarized segments
    if (segmentsSinceLastSummaryRef.current > 0) {
      triggerSummary(elapsedRef.current)
    }
  }, [triggerSummary])

  useEffect(() => {
    return () => {
      isRecordingRef.current = false
      if (timerRef.current) clearInterval(timerRef.current)
      if (chunkTimerRef.current) clearInterval(chunkTimerRef.current)
      cancelAnimationFrame(animFrameRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
      audioCtxRef.current?.close()
    }
  }, [])

  const saveToKB = useCallback(async () => {
    const valid = segments.filter(s => s.original.trim() && !s.pending)
    if (valid.length === 0) return

    setSaving(true)
    setSaveError('')

    const title = saveTitle.trim() ||
      `Recording ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`

    const lines: string[] = [
      `# ${title}`,
      '',
      `**Duration:** ${formatTime(elapsed)}  ·  **Segments:** ${valid.length}`,
      '',
    ]

    if (summaries.some(s => !s.pending && s.content)) {
      lines.push('## Key Points', '')
      for (const s of summaries.filter(s => !s.pending && s.content)) {
        lines.push(`### ${formatTime(s.startSec)}`, '', s.content, '')
      }
    }

    lines.push('## Full Transcript', '')
    for (const s of valid) {
      lines.push(`**[${formatTime(s.startSec)}]** ${s.original}`)
      if (s.translation) lines.push(`> *${s.translation}*`)
      lines.push('')
    }

    try {
      const result = await window.omykb.ingestSource({
        type: 'text',
        content: lines.join('\n'),
        title,
        workspaceId,
      })
      if ('error' in result) {
        setSaveError((result as { error: string }).error)
      } else {
        onSaved()
      }
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [segments, summaries, elapsed, saveTitle, workspaceId, onSaved])

  const validSegments = segments.filter(s => !s.pending || s.original)
  const hasContent = segments.some(s => s.original.trim())

  return (
    <div className="h-full flex flex-col bg-[radial-gradient(circle_at_top_left,_rgba(67,56,202,0.12),_transparent_40%),linear-gradient(180deg,_#0c1018_0%,_#0b0f17_100%)]">

      {/* ── Header ── */}
      <div className="flex-shrink-0 flex items-center justify-between gap-4 px-6 py-4 border-b border-white/[0.08]">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-200 transition-colors flex-shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Sources
          </button>
          <span className="text-white/20">/</span>
          <div className="flex items-center gap-2 min-w-0">
            {recState === 'recording' && (
              <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse flex-shrink-0" />
            )}
            <span className="text-sm font-medium text-slate-100 truncate">
              {recState === 'idle' ? 'New Recording' : recState === 'recording' ? 'Recording…' : 'Session Complete'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {recState === 'stopped' && (
            <input
              value={saveTitle}
              onChange={e => setSaveTitle(e.target.value)}
              placeholder="Session title…"
              className="w-52 bg-white/[0.05] border border-white/10 rounded-full px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-400/50 placeholder:text-slate-600"
            />
          )}
          {recState === 'stopped' && hasContent && (
            <button
              onClick={saveToKB}
              disabled={saving}
              className="btn-primary rounded-full px-5 py-2 text-sm"
            >
              {saving ? 'Saving…' : 'Save to KB'}
            </button>
          )}
        </div>
      </div>

      {/* ── Controls + Waveform ── */}
      <div className="flex-shrink-0 flex items-center justify-between gap-6 px-6 py-5 border-b border-white/[0.06] bg-white/[0.01]">

        {/* Timer */}
        <div className="font-mono text-3xl font-light tabular-nums text-slate-100 w-28 flex-shrink-0">
          {formatTime(elapsed)}
        </div>

        {/* Waveform */}
        <div className="flex-1 flex justify-center">
          <WaveformBars data={waveData} active={recState === 'recording'} />
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Language + translate */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={translateEnabled}
                onChange={e => setTranslateEnabled(e.target.checked)}
                className="accent-indigo-400 w-3.5 h-3.5"
              />
              Translate
            </label>
            {translateEnabled && (
              <select
                value={targetLang}
                onChange={e => setTargetLang(e.target.value)}
                className="bg-white/[0.06] border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-300 outline-none"
              >
                {LANGUAGES.map(l => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            )}
          </div>

          {/* Record / Stop */}
          {recState === 'idle' && (
            <button
              onClick={start}
              className="flex items-center gap-2 rounded-full px-5 py-2.5 bg-red-500 hover:bg-red-400 text-white text-sm font-medium transition-colors"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-white" />
              Record
            </button>
          )}
          {recState === 'recording' && (
            <button
              onClick={stop}
              className="flex items-center gap-2 rounded-full px-5 py-2.5 bg-white/10 hover:bg-white/15 text-slate-200 text-sm font-medium transition-colors border border-white/10"
            >
              <span className="w-3 h-3 rounded-sm bg-slate-200 flex-shrink-0" />
              Stop
            </button>
          )}
          {recState === 'stopped' && (
            <div className="text-xs text-slate-500 px-3">
              Session ended
            </div>
          )}
        </div>
      </div>

      {/* ── Perm error ── */}
      {permError && (
        <div className="mx-6 mt-4 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-xs text-red-300">
          {permError}
        </div>
      )}
      {saveError && (
        <div className="mx-6 mt-2 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-xs text-red-300">
          {saveError}
        </div>
      )}

      {/* ── Body: Transcript + Summaries ── */}
      {recState === 'idle' && !permError ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full border border-white/10 bg-white/[0.03] flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-500">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </div>
            <p className="text-sm text-slate-500">Press Record to start capturing audio</p>
            <p className="mt-1 text-xs text-slate-600">Transcription, translation, and summaries appear in real time</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex gap-0 overflow-hidden">

          {/* ── Left: Transcript ── */}
          <div className="flex-1 min-w-0 overflow-y-auto px-6 py-5 space-y-3 scrollbar-thin">
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate-600 mb-4">Transcript</div>

            {validSegments.length === 0 && recState === 'recording' && (
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Listening…
              </div>
            )}

            {validSegments.map(seg => (
              <div key={seg.id} className="group">
                <div className={`rounded-2xl border px-4 py-3 transition-colors ${
                  seg.pending
                    ? 'border-white/[0.06] bg-white/[0.02]'
                    : 'border-white/[0.08] bg-white/[0.03]'
                }`}>
                  <div className="text-[10px] font-mono text-slate-600 mb-1.5">
                    {formatTime(seg.startSec)}
                  </div>

                  {seg.pending ? (
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                      Transcribing…
                    </div>
                  ) : (
                    <p className="text-sm text-slate-200 leading-relaxed">{seg.original}</p>
                  )}

                  {seg.translating && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                      Translating…
                    </div>
                  )}

                  {seg.translation && !seg.translating && (
                    <p className="mt-2 pt-2 border-t border-white/[0.06] text-sm text-indigo-300/80 leading-relaxed italic">
                      {seg.translation}
                    </p>
                  )}
                </div>
              </div>
            ))}

            <div ref={transcriptEndRef} />
          </div>

          {/* ── Divider ── */}
          <div className="w-px bg-white/[0.06] flex-shrink-0" />

          {/* ── Right: Summaries ── */}
          <div className="w-80 flex-shrink-0 overflow-y-auto px-5 py-5 space-y-3 scrollbar-thin">
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate-600 mb-4">
              Summaries
              <span className="ml-2 text-slate-700 normal-case tracking-normal">
                · every {SUMMARY_EVERY_N_SEGMENTS} segments
              </span>
            </div>

            {summaries.length === 0 && (
              <p className="text-xs text-slate-700">
                A summary will appear after {SUMMARY_EVERY_N_SEGMENTS} transcript segments.
              </p>
            )}

            {summaries.map(sum => (
              <div
                key={sum.id}
                className="rounded-2xl border border-indigo-400/15 bg-indigo-400/[0.06] px-4 py-3"
              >
                <div className="flex items-center gap-2 mb-2">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-400 flex-shrink-0">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                  <span className="text-[10px] font-mono text-indigo-400/70">{formatTime(sum.startSec)}</span>
                </div>

                {sum.pending ? (
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                    Summarizing…
                  </div>
                ) : (
                  <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                    {sum.content}
                  </div>
                )}
              </div>
            ))}

            <div ref={summaryEndRef} />
          </div>
        </div>
      )}
    </div>
  )
}
