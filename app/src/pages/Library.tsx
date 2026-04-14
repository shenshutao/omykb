import React, { useState, useEffect, useCallback } from 'react'
import { Document, IngestSourcePayload } from '../types'

function formatSize(bytes?: number) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes}B`
  return `${(bytes / 1024).toFixed(1)}KB`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function TagBadge({ tag }: { tag: string }) {
  return (
    <span className="text-xs bg-[#21262d] text-slate-400 px-2 py-0.5 rounded-full">{tag}</span>
  )
}

interface DocRowProps {
  doc: Document
  selected: boolean
  onClick: () => void
  onDelete: () => void
}

function DocRow({ doc, selected, onClick, onDelete }: DocRowProps) {
  return (
    <div
      onClick={onClick}
      className={`px-4 py-3 cursor-pointer border-b border-[#21262d] hover:bg-[#161b22] transition-colors ${selected ? 'bg-[#161b22] border-l-2 border-l-indigo-500' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-200 truncate">{doc.title}</div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {doc.tags.slice(0, 3).map(tag => <TagBadge key={tag} tag={tag} />)}
            <span className="text-xs text-slate-600">{formatDate(doc.addedAt)}</span>
            {doc.size && <span className="text-xs text-slate-600">{formatSize(doc.size)}</span>}
          </div>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0 p-1"
          title="Delete"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default function Library() {
  const [docs, setDocs] = useState<Document[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [addType, setAddType] = useState<'text' | 'url' | 'git'>('text')
  const [addTitle, setAddTitle] = useState('')
  const [addContent, setAddContent] = useState('')
  const [addCrawl, setAddCrawl] = useState(true)
  const [addError, setAddError] = useState('')
  const [addBusy, setAddBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const list = await window.omykb.listDocuments()
    setDocs(list.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const selectDoc = async (id: string) => {
    setSelected(id)
    const raw = await window.omykb.getDocument(id)
    setContent(raw)
  }

  const deleteDoc = async (id: string) => {
    await window.omykb.deleteDocument(id)
    if (selected === id) { setSelected(null); setContent(null) }
    await load()
  }

  const addDoc = async () => {
    setAddError('')
    if (!addContent.trim()) { setAddError('Content is required'); return }
    setAddBusy(true)
    const payload: IngestSourcePayload = {
      type: addType,
      content: addContent.trim(),
      title: addTitle.trim() || undefined,
      options: addType === 'url'
        ? { crawl: addCrawl, maxPages: addCrawl ? 12 : 1, maxDepth: addCrawl ? 1 : 0 }
        : undefined,
    }
    try {
      const result = await window.omykb.ingestSource(payload)
      if ('error' in result) { setAddError(result.error); return }
      setAdding(false)
      setAddTitle('')
      setAddContent('')
      setAddCrawl(true)
      await load()
    } finally {
      setAddBusy(false)
    }
  }

  const filtered = docs.filter(d =>
    d.title.toLowerCase().includes(search.toLowerCase()) ||
    d.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="flex h-full">
      {/* Left: list */}
      <div className="w-80 flex-shrink-0 border-r border-[#21262d] flex flex-col">
        <div className="p-4 border-b border-[#21262d]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-200">Library</h2>
            <button onClick={() => setAdding(true)} className="btn-primary py-1 text-xs">
              + Add
            </button>
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search documents…"
            className="input-base text-xs"
          />
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {loading ? (
            <div className="p-4 text-center text-slate-500 text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              {search ? 'No matches' : 'No documents yet'}
            </div>
          ) : (
            filtered.map(doc => (
              <DocRow
                key={doc.id}
                doc={doc}
                selected={selected === doc.id}
                onClick={() => selectDoc(doc.id)}
                onDelete={() => deleteDoc(doc.id)}
              />
            ))
          )}
        </div>

        <div className="p-3 border-t border-[#21262d] text-xs text-slate-600 text-center">
          {docs.length} document{docs.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Right: viewer */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {selected && content ? (
          <div className="p-6">
            <pre className="text-sm text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">{content}</pre>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-600 text-sm">
            Select a document to preview
          </div>
        )}
      </div>

      {/* Add document modal */}
      {adding && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setAdding(false)}>
          <div className="card p-6 w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-200 mb-4">Add Document</h3>

            <div className="flex gap-2 mb-4">
              {(['text', 'url', 'git'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setAddType(type)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${addType === type ? 'bg-indigo-600 text-white' : 'btn-ghost'}`}
                >
                  {type === 'text' ? '📝 Text / Markdown' : type === 'url' ? '🌐 Website / URL' : '🧬 Git Repo'}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              <input
                value={addTitle}
                onChange={e => setAddTitle(e.target.value)}
                placeholder="Title (optional)"
                className="input-base"
              />
              <textarea
                value={addContent}
                onChange={e => setAddContent(e.target.value)}
                placeholder={
                  addType === 'url'
                    ? 'https://docs.example.com'
                    : addType === 'git'
                      ? 'https://github.com/owner/repo'
                      : 'Paste your text or Markdown…'
                }
                rows={6}
                className="input-base resize-none"
              />
              {addType === 'url' && (
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={addCrawl}
                    onChange={e => setAddCrawl(e.target.checked)}
                    className="accent-indigo-500"
                  />
                  Recursively crawl same-domain pages and curate them into one Markdown knowledge note
                </label>
              )}
              <p className="text-xs text-slate-500">
                Agent ingestion will fetch raw content, curate it into Markdown, and store it in the local knowledge base.
              </p>
              {addError && <p className="text-xs text-red-400">{addError}</p>}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setAdding(false)} className="btn-ghost" disabled={addBusy}>Cancel</button>
              <button onClick={addDoc} className="btn-primary" disabled={addBusy}>
                {addBusy ? 'Ingesting…' : 'Ingest to KB'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
