import React, { useCallback, useEffect, useRef, useState } from 'react'
import { marked } from 'marked'
import Chat from './Chat'
import AudioRecorder from './AudioRecorder'
import { Document, IngestResult, IngestSourcePayload, ToolEvent, Workspace } from '../types'

function formatSize(bytes?: number) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes}B`
  return `${(bytes / 1024).toFixed(1)}KB`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatToolName(name: string) {
  return name.replace(/_/g, ' ')
}

function summarizeToolInput(input: unknown) {
  if (!input || typeof input !== 'object') return ''
  const entries = Object.entries(input as Record<string, unknown>)
    .filter(([, value]) => value !== undefined && value !== '')
    .slice(0, 3)
    .map(([key, value]) => {
      const rendered = typeof value === 'string'
        ? value.length > 42 ? `${value.slice(0, 42)}…` : value
        : String(value)
      return `${key}: ${rendered}`
    })
  return entries.join(' · ')
}

function ImportTraceCard({ result }: { result: IngestResult }) {
  const trace = result.toolTrace || []

  return (
    <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Import trace</div>
          <div className="mt-1 text-sm font-medium text-slate-100">{result.title}</div>
        </div>
        <span className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-wide ${
          result.ingestionMode === 'skill'
            ? 'bg-emerald-400/10 text-emerald-200'
            : 'bg-amber-300/10 text-amber-200'
        }`}>
          {result.ingestionMode || 'import'}
        </span>
      </div>
      <div className="mt-2 text-xs text-slate-400">
        {result.type} · {result.wordCount} words · {trace.length} tool{trace.length !== 1 ? 's' : ''}
      </div>
      {trace.length > 0 && (
        <div className="mt-3 space-y-2">
          {trace.map((event: ToolEvent, index) => (
            <div key={`${event.name}-${index}`} className="rounded-xl border border-white/[0.06] bg-black/10 px-3 py-2">
              <div className="text-xs font-medium text-slate-200">{index + 1}. {formatToolName(event.name)}</div>
              {summarizeToolInput(event.input) && (
                <div className="mt-1 text-[11px] leading-relaxed text-slate-500">{summarizeToolInput(event.input)}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function WorkspacePage({
  workspaceId,
  workspaces,
  onGoToSettings,
}: {
  workspaceId: string
  workspaces: Workspace[]
  onGoToSettings: () => void
}) {
  const [view, setView] = useState<'main' | 'record'>('main')
  const [docs, setDocs] = useState<Document[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [addType, setAddType] = useState<'text' | 'url' | 'git' | 'file'>('text')
  const [addContent, setAddContent] = useState('')
  const [addCrawl, setAddCrawl] = useState(true)
  const [addError, setAddError] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const [lastImportResult, setLastImportResult] = useState<IngestResult | null>(null)

  // Move popover state
  const [moveDocId, setMoveDocId] = useState<string | null>(null)
  const movePopoverRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const list = await window.omykb.listDocumentsInWorkspace(workspaceId)
    setDocs((list as Document[]).sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()))
    setLoading(false)
  }, [workspaceId])

  useEffect(() => { load() }, [load])

  // Close move popover on outside click
  useEffect(() => {
    if (!moveDocId) return
    const handler = (e: MouseEvent) => {
      if (movePopoverRef.current && !movePopoverRef.current.contains(e.target as Node)) {
        setMoveDocId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [moveDocId])

  const openDoc = async (id: string) => {
    setSelected(id)
    setContent(null)
    const raw = await window.omykb.getDocument(id, workspaceId)
    setContent(raw)
  }

  const closeDoc = () => {
    setSelected(null)
    setContent(null)
  }

  const deleteDoc = async (id: string) => {
    await window.omykb.deleteDocument(id, workspaceId)
    if (selected === id) { setSelected(null); setContent(null) }
    await load()
  }

  const moveDoc = async (docId: string, toWorkspaceId: string) => {
    await window.omykb.moveDocument(docId, workspaceId, toWorkspaceId)
    if (selected === docId) { setSelected(null); setContent(null) }
    setMoveDocId(null)
    await load()
  }

  const addDoc = async () => {
    setAddError('')
    if (!addContent.trim()) { setAddError('Content is required'); return }
    setAddBusy(true)
    const payload: IngestSourcePayload & { workspaceId: string } = {
      type: addType,
      content: addContent.trim(),
      workspaceId,
      options: addType === 'url'
        ? { crawl: addCrawl, maxPages: addCrawl ? 12 : 1, maxDepth: addCrawl ? 1 : 0 }
        : undefined,
    }
    try {
      const result = await window.omykb.ingestSource(payload)
      if ('error' in result) { setAddError(result.error); return }
      setLastImportResult(result)
      setAdding(false)
      setAddContent('')
      setAddCrawl(true)
      await load()
      await openDoc(result.id)
    } finally {
      setAddBusy(false)
    }
  }

  const pickLocalFile = async () => {
    const picked = await window.omykb.pickFile()
    if (picked) { setAddType('file'); setAddContent(picked) }
  }

  const filtered = docs.filter(d =>
    d.title.toLowerCase().includes(search.toLowerCase()) ||
    d.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
  )

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const selectedDoc = docs.find(doc => doc.id === selected) || null
  const otherWorkspaces = workspaces.filter(w => w.id !== workspaceId)
  const selectedTraceResult = selectedDoc && lastImportResult?.id === selectedDoc.id ? lastImportResult : null

  if (view === 'record') {
    return (
      <AudioRecorder
        workspaceId={workspaceId}
        onBack={() => setView('main')}
        onSaved={() => { setView('main'); load() }}
      />
    )
  }

  return (
    <div className="h-full flex overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(67,56,202,0.14),_transparent_32%),linear-gradient(180deg,_#0c1018_0%,_#0b0f17_100%)]">
      <aside className={`flex-shrink-0 border-r border-white/10 bg-[#121722]/90 backdrop-blur-xl flex flex-col transition-all duration-300 ${sidebarCollapsed ? 'w-12' : 'w-[360px]'}`}>

        {sidebarCollapsed ? (
          /* ── Collapsed rail ── */
          <div className="flex flex-col items-center gap-3 pt-4 px-2">
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="rounded-full p-2 text-slate-500 hover:bg-white/[0.07] hover:text-slate-200 transition-colors"
              title="Expand sources"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>
            <button
              onClick={() => setAdding(true)}
              className="rounded-full p-2 text-slate-500 hover:bg-white/[0.07] hover:text-amber-300 transition-colors"
              title="Import source"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
            <div className="mt-2 flex flex-col items-center gap-2">
              {filtered.map(doc => (
                <button
                  key={doc.id}
                  onClick={() => openDoc(doc.id)}
                  title={doc.title}
                  className={`w-7 h-7 rounded-full text-[9px] font-bold uppercase transition-colors ${
                    selected === doc.id
                      ? 'bg-amber-300/20 text-amber-300 border border-amber-300/30'
                      : 'bg-white/[0.05] text-slate-500 hover:bg-white/[0.09] hover:text-slate-300'
                  }`}
                >
                  {doc.title.charAt(0)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ── Expanded panel ── */
          <>
        <div className="px-5 pt-5 pb-4 border-b border-white/10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Sources</div>
              <h1 className="mt-2 text-xl font-semibold text-slate-100">Import and ground</h1>
              <p className="mt-1 text-sm text-slate-400 leading-relaxed">
                Bring in files, notes, docs sites, or repos.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setSidebarCollapsed(true)}
                className="rounded-full p-1.5 text-slate-500 hover:bg-white/[0.07] hover:text-slate-300 transition-colors"
                title="Collapse sidebar"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 18l-6-6 6-6"/>
                </svg>
              </button>
              <button onClick={() => setAdding(true)} className="btn-primary py-2 px-3 text-xs rounded-full">
                Import
              </button>
            </div>
          </div>
          <div className="mt-4">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search source library…"
              className="input-base text-xs bg-white/[0.04] border-white/10"
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
          {loading ? (
            <div className="p-6 text-sm text-slate-500">Loading knowledge sources…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">{search ? 'No matching sources' : 'No sources imported yet'}</div>
          ) : (
            <div className="p-3 space-y-2">
              {filtered.map(doc => (
                <div
                  key={doc.id}
                  className={`rounded-2xl border px-3 py-3 transition-colors ${
                    selected === doc.id
                      ? 'border-amber-300/40 bg-amber-300/10'
                      : 'border-white/8 bg-white/[0.03] hover:bg-white/[0.05]'
                  }`}
                >
                  <button className="w-full text-left" onClick={() => openDoc(doc.id)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-100 truncate">{doc.title}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {formatDate(doc.addedAt)}
                          {doc.wordCount ? ` · ${doc.wordCount} words` : ''}
                          {doc.size ? ` · ${formatSize(doc.size)}` : ''}
                        </div>
                      </div>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-wide text-slate-400 flex-shrink-0">
                        {doc.type || 'doc'}
                      </span>
                    </div>
                    {doc.summary && (
                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-400">{doc.summary}</p>
                    )}
                  </button>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1 min-w-0">
                      {doc.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-slate-400">
                          {tag}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Move to workspace */}
                      {otherWorkspaces.length > 0 && (
                        <div className="relative">
                          <button
                            onClick={e => { e.stopPropagation(); setMoveDocId(moveDocId === doc.id ? null : doc.id) }}
                            className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-slate-500 hover:bg-white/[0.06] hover:text-slate-300 transition-colors"
                            title="Move to workspace"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M5 12h14M12 5l7 7-7 7"/>
                            </svg>
                            Move
                          </button>
                          {moveDocId === doc.id && (
                            <div
                              ref={movePopoverRef}
                              className="absolute bottom-full right-0 mb-1.5 w-40 rounded-xl border border-white/10 bg-[#161b22] shadow-2xl overflow-hidden z-10"
                            >
                              <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-slate-600 border-b border-white/[0.06]">
                                Move to
                              </div>
                              {otherWorkspaces.map(ws => (
                                <button
                                  key={ws.id}
                                  onClick={e => { e.stopPropagation(); moveDoc(doc.id, ws.id) }}
                                  className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-white/[0.05] transition-colors"
                                >
                                  {ws.name}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Delete */}
                      <button
                        onClick={e => { e.stopPropagation(); deleteDoc(doc.id) }}
                        className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                        title="Delete source"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14H6L5 6" />
                          <path d="M10 11v6M14 11v6" />
                          <path d="M9 6V4h6v2" />
                        </svg>
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
          </>
        )}
      </aside>

      <section className="min-w-0 flex-1 p-5">
        <div className="h-full rounded-[28px] border border-white/10 bg-[#0f141d]/80 shadow-[0_30px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl overflow-hidden flex flex-col">

          {selectedDoc ? (
            /* ── Document viewer ── */
            <>
              <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-white/[0.08] flex-shrink-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent)]">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-slate-500 mb-1.5">
                    <button
                      onClick={closeDoc}
                      className="flex items-center gap-1 hover:text-amber-400 transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M19 12H5M12 5l-7 7 7 7"/>
                      </svg>
                      Sources
                    </button>
                    <span className="text-white/20">/</span>
                    <span>{selectedDoc.type || 'doc'}</span>
                    {selectedDoc.wordCount ? <><span className="text-white/20">·</span><span>{selectedDoc.wordCount} words</span></> : null}
                    <span className="text-white/20">·</span>
                    <span>{formatDate(selectedDoc.addedAt)}</span>
                  </div>
                  <h2 className="text-xl font-semibold text-slate-100 leading-snug truncate">{selectedDoc.title}</h2>
                  {selectedDoc.summary && (
                    <p className="mt-1 text-sm text-slate-400 leading-relaxed line-clamp-2">{selectedDoc.summary}</p>
                  )}
                  {selectedDoc.tags.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {selectedDoc.tags.map(tag => (
                        <span key={tag} className="rounded-full bg-white/[0.06] border border-white/[0.07] px-2.5 py-0.5 text-[10px] text-slate-400">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={closeDoc}
                  className="flex-shrink-0 rounded-full p-2 text-slate-500 hover:bg-white/[0.07] hover:text-slate-200 transition-colors"
                  title="Close"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto px-8 py-7 scrollbar-thin">
                {content === null ? (
                  <p className="text-sm text-slate-500">Loading…</p>
                ) : (
                  <>
                    {selectedTraceResult && <ImportTraceCard result={selectedTraceResult} />}
                    <div
                      className="prose-doc"
                      dangerouslySetInnerHTML={{ __html: marked(content) as string }}
                    />
                  </>
                )}
              </div>
            </>
          ) : (
            /* ── Grounded chat ── */
            <>
              <div className="px-6 py-5 border-b border-white/10 flex-shrink-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent)]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Notebook Workspace</div>
                    <h2 className="mt-2 text-2xl font-semibold text-slate-100">Ask your knowledge base</h2>
                    <p className="mt-1 text-sm text-slate-400">
                      Ask questions against imported material, or trigger skills to fetch and save new knowledge.
                    </p>
                  </div>
                  <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-200">
                    {docs.length} source{docs.length !== 1 ? 's' : ''} loaded
                  </div>
                </div>
              </div>
              <Chat embedded />
            </>
          )}

        </div>
      </section>

      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4" onClick={() => setAdding(false)}>
          <div className="w-full max-w-xl rounded-[28px] border border-white/10 bg-[#121722] p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Import</div>
                <h3 className="mt-2 text-xl font-semibold text-slate-100">Create a grounded source</h3>
              </div>
              <button onClick={() => setAdding(false)} className="btn-ghost rounded-full" disabled={addBusy}>Close</button>
            </div>

            <div className="mt-5 flex gap-2 flex-wrap">
              {(['text', 'file', 'url', 'git'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setAddType(type)}
                  className={`rounded-full px-4 py-2 text-sm transition-colors ${
                    addType === type ? 'bg-amber-300 text-slate-900' : 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'
                  }`}
                >
                  {type === 'text' ? 'Text' : type === 'file' ? 'File' : type === 'url' ? 'Website' : 'Git Repo'}
                </button>
              ))}
              <button
                onClick={() => { setAdding(false); setView('record') }}
                className="rounded-full px-4 py-2 text-sm transition-colors bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] flex items-center gap-1.5"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
                Record
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <textarea
                value={addContent}
                onChange={e => setAddContent(e.target.value)}
                rows={8}
                placeholder={
                  addType === 'text' ? 'Paste notes, meeting transcript, or raw text…'
                    : addType === 'file' ? '/Users/you/Documents/report.pdf'
                    : addType === 'url' ? 'https://docs.example.com'
                    : 'https://github.com/owner/repo'
                }
                className="input-base resize-none bg-white/[0.04] border-white/10"
              />
              {addType === 'file' && (
                <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                  <div className="text-xs text-slate-400">
                    Supported: PDF, DOCX, PPTX, XLSX, CSV, JSON, HTML, XML, Markdown, TXT, IPYNB, images, audio, video
                  </div>
                  <button onClick={pickLocalFile} className="btn-ghost rounded-full" type="button">
                    Choose file
                  </button>
                </div>
              )}
              {addType === 'url' && (
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={addCrawl}
                    onChange={e => setAddCrawl(e.target.checked)}
                    className="accent-amber-400"
                  />
                  Crawl same-domain pages before curating the Markdown source
                </label>
              )}
              <p className="text-xs leading-relaxed text-slate-500">
                The agent will fetch the raw material, clean and summarise it, then store a Markdown knowledge note for grounded chat.
              </p>
              {addError && <p className="text-xs text-red-400">{addError}</p>}
            </div>

            <div className="mt-6 flex items-center justify-between gap-2">
              <button
                onClick={() => { setAdding(false); onGoToSettings() }}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-slate-500 hover:bg-white/[0.06] hover:text-slate-300 transition-colors"
                title="Edit this skill in Settings"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                  <path d="M2 17l10 5 10-5"/>
                  <path d="M2 12l10 5 10-5"/>
                </svg>
                <span className="font-mono">
                  {addType === 'text' ? '/kb:import-text'
                    : addType === 'file' ? '/kb:import-file'
                    : addType === 'url' ? '/kb:import-url'
                    : '/kb:import-git'}
                </span>
              </button>
              <div className="flex gap-2">
                <button onClick={() => setAdding(false)} className="btn-ghost" disabled={addBusy}>Cancel</button>
                <button onClick={addDoc} className="btn-primary rounded-full px-5" disabled={addBusy}>
                  {addBusy ? 'Importing…' : 'Import to KB'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
