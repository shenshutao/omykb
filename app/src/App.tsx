import React, { useState, useRef, useEffect } from 'react'
import Workspace from './pages/Workspace'
import Settings from './pages/Settings'
import Onboarding from './pages/Onboarding'
import { KBConfig, Workspace as WorkspaceRecord } from './types'

type Page = 'workspace' | 'settings'
export type SettingsSection = 'llm' | 'skills' | 'storage' | 'prompt'

const SETTINGS_MENU: Array<{ id: SettingsSection; label: string; description: string; icon: React.ReactNode }> = [
  {
    id: 'llm',
    label: 'LLM & API',
    description: 'Provider, model, API key',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2a10 10 0 1 0 10 10H12V2z"/><path d="M12 2a10 10 0 0 1 10 10"/>
        <path d="M12 12 2.1 9.1"/>
      </svg>
    ),
  },
  {
    id: 'skills',
    label: 'Skills',
    description: 'View and edit agent skills',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
    ),
  },
  {
    id: 'storage',
    label: 'Storage',
    description: 'Local knowledge base path',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
      </svg>
    ),
  },
  {
    id: 'prompt',
    label: 'System Prompt',
    description: 'Customise agent behaviour',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  },
]

export default function App() {
  const [page, setPage] = useState<Page>('workspace')
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('llm')
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [workspaceRailCollapsed, setWorkspaceRailCollapsed] = useState(false)
  const [cfg, setCfg] = useState<KBConfig | null>(null)
  const [booting, setBooting] = useState(true)
  const popoverRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Workspaces
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)
  const [newWsName, setNewWsName] = useState('')
  const [addingWs, setAddingWs] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const loadBootState = async () => {
    const [config, ws] = await Promise.all([
      window.omykb.getConfig(),
      window.omykb.listWorkspaces(),
    ])
    setCfg(config)
    setWorkspaces(ws)
    if (ws.length > 0 && !activeWorkspaceId) setActiveWorkspaceId(ws[0].id)
    setBooting(false)
  }

  useEffect(() => { loadBootState() }, [])

  const createWorkspace = async () => {
    const name = newWsName.trim() || 'Untitled'
    const ws = await window.omykb.createWorkspace(name)
    setWorkspaces(prev => [...prev, ws])
    setActiveWorkspaceId(ws.id)
    setNewWsName('')
    setAddingWs(false)
  }

  const deleteWorkspace = async (id: string) => {
    await window.omykb.deleteWorkspace(id)
    const next = workspaces.filter(w => w.id !== id)
    setWorkspaces(next)
    if (activeWorkspaceId === id) setActiveWorkspaceId(next[0]?.id ?? null)
  }

  const startRename = (ws: WorkspaceRecord) => {
    setRenamingId(ws.id)
    setRenameValue(ws.name)
  }

  const commitRename = async (id: string) => {
    if (!renameValue.trim()) { setRenamingId(null); return }
    const updated = await window.omykb.renameWorkspace(id, renameValue.trim())
    setWorkspaces(prev => prev.map(w => w.id === id ? updated : w))
    setRenamingId(null)
  }

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) setPopoverOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const openSettings = (section: SettingsSection) => {
    setSettingsSection(section)
    setPage('settings')
    setPopoverOpen(false)
  }

  if (booting || !cfg) {
    return <div className="h-screen bg-[#0d1117]" />
  }

  if (!cfg.setupCompleted) {
    return (
      <Onboarding
        initialConfig={cfg}
        onComplete={(nextWorkspaces, nextActiveWorkspaceId) => {
          setCfg(prev => prev ? { ...prev, setupCompleted: true } : prev)
          setWorkspaces(nextWorkspaces)
          setActiveWorkspaceId(nextActiveWorkspaceId)
          setPage('workspace')
        }}
      />
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#0d1117]">

      {/* Workspace rail — far left */}
      <div className={`flex-shrink-0 bg-[#090d13] border-r border-[#21262d] flex flex-col transition-all duration-300 ${workspaceRailCollapsed ? 'w-12' : 'w-44'}`}>
        <div className="h-10 drag-region" />
        {workspaceRailCollapsed ? (
          <div className="flex flex-1 flex-col items-center gap-3 px-2 pt-4">
            <button
              onClick={() => setWorkspaceRailCollapsed(false)}
              className="rounded-full p-2 text-slate-500 hover:bg-white/[0.07] hover:text-slate-200 transition-colors"
              title="Expand workspaces"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>
            <button
              onClick={() => setAddingWs(true)}
              className="rounded-full p-2 text-slate-500 hover:bg-white/[0.07] hover:text-amber-300 transition-colors"
              title="New workspace"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
            <div className="mt-2 flex flex-col items-center gap-2">
              {workspaces.map(ws => (
                <button
                  key={ws.id}
                  onClick={() => { setActiveWorkspaceId(ws.id); setPage('workspace') }}
                  title={ws.name}
                  className={`w-7 h-7 rounded-full text-[9px] font-bold uppercase transition-colors ${
                    activeWorkspaceId === ws.id && page === 'workspace'
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-300/30'
                      : 'bg-white/[0.05] text-slate-500 hover:bg-white/[0.09] hover:text-slate-300'
                  }`}
                >
                  {ws.name.charAt(0)}
                </button>
              ))}
            </div>
            <div className="mt-auto pb-3 relative">
              {popoverOpen && (
                <div
                  ref={popoverRef}
                  className="absolute bottom-full left-1/2 mb-2 w-52 -translate-x-1/2 rounded-2xl border border-white/10 bg-[#161b22] shadow-2xl overflow-hidden"
                >
                  {SETTINGS_MENU.map((item, i) => (
                    <button
                      key={item.id}
                      onClick={() => openSettings(item.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.05] transition-colors ${
                        i < SETTINGS_MENU.length - 1 ? 'border-b border-white/[0.06]' : ''
                      } ${page === 'settings' && settingsSection === item.id ? 'text-indigo-300' : 'text-slate-300'}`}
                    >
                      <span className="text-slate-500 flex-shrink-0">{item.icon}</span>
                      <div>
                        <div className="text-xs font-medium">{item.label}</div>
                        <div className="text-[11px] text-slate-600 mt-0.5">{item.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <button
                ref={triggerRef}
                onClick={() => setPopoverOpen(v => !v)}
                className={`rounded-full p-2 transition-colors ${
                  page === 'settings'
                    ? 'bg-indigo-500/15 text-indigo-300'
                    : 'text-slate-500 hover:bg-white/[0.07] hover:text-slate-300'
                }`}
                title="Settings"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="px-3 pb-2 border-b border-[#21262d]">
              <div className="flex items-center justify-between gap-2 px-1 mb-2">
                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-600">Workspaces</div>
                <button
                  onClick={() => setWorkspaceRailCollapsed(true)}
                  className="rounded-full p-1.5 text-slate-500 hover:bg-white/[0.07] hover:text-slate-300 transition-colors"
                  title="Collapse workspaces"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 18l-6-6 6-6"/>
                  </svg>
                </button>
              </div>
              <div className="space-y-0.5">
                {workspaces.map(ws => (
                  <div
                    key={ws.id}
                    className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 cursor-pointer transition-colors ${
                      activeWorkspaceId === ws.id && page === 'workspace'
                        ? 'bg-indigo-500/15 text-indigo-300'
                        : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                    }`}
                    onClick={() => { setActiveWorkspaceId(ws.id); setPage('workspace') }}
                  >
                    {renamingId === ws.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={() => commitRename(ws.id)}
                        onKeyDown={e => { if (e.key === 'Enter') commitRename(ws.id); if (e.key === 'Escape') setRenamingId(null) }}
                        onClick={e => e.stopPropagation()}
                        className="flex-1 bg-transparent text-xs text-slate-200 outline-none border-b border-indigo-400 min-w-0"
                      />
                    ) : (
                      <span className="flex-1 text-xs truncate" onDoubleClick={e => { e.stopPropagation(); startRename(ws) }}>
                        {ws.name}
                      </span>
                    )}
                    {renamingId !== ws.id && workspaces.length > 1 && (
                      <button
                        onClick={e => { e.stopPropagation(); deleteWorkspace(ws.id) }}
                        className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all flex-shrink-0"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {addingWs ? (
                <div className="mt-1.5 flex items-center gap-1">
                  <input
                    autoFocus
                    value={newWsName}
                    onChange={e => setNewWsName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') createWorkspace(); if (e.key === 'Escape') setAddingWs(false) }}
                    onBlur={() => { if (newWsName.trim()) createWorkspace(); else setAddingWs(false) }}
                    placeholder="Name…"
                    className="flex-1 bg-white/[0.05] border border-white/10 rounded px-2 py-1 text-xs text-slate-200 outline-none min-w-0"
                  />
                </div>
              ) : (
                <button
                  onClick={() => setAddingWs(true)}
                  className="mt-1.5 w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-slate-600 hover:text-slate-400 hover:bg-white/[0.04] transition-colors"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  New
                </button>
              )}
            </div>

            <div className="flex-1" />

            {/* Settings trigger */}
            <div className="p-3 border-t border-[#21262d] relative">
              {popoverOpen && (
                <div
                  ref={popoverRef}
                  className="absolute bottom-full left-0 right-0 mb-2 rounded-2xl border border-white/10 bg-[#161b22] shadow-2xl overflow-hidden"
                >
                  {SETTINGS_MENU.map((item, i) => (
                    <button
                      key={item.id}
                      onClick={() => openSettings(item.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.05] transition-colors ${
                        i < SETTINGS_MENU.length - 1 ? 'border-b border-white/[0.06]' : ''
                      } ${page === 'settings' && settingsSection === item.id ? 'text-indigo-300' : 'text-slate-300'}`}
                    >
                      <span className="text-slate-500 flex-shrink-0">{item.icon}</span>
                      <div>
                        <div className="text-xs font-medium">{item.label}</div>
                        <div className="text-[11px] text-slate-600 mt-0.5">{item.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <button
                ref={triggerRef}
                onClick={() => setPopoverOpen(v => !v)}
                className={`sidebar-link w-full text-xs ${page === 'settings' ? 'active' : ''}`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Settings
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`ml-auto transition-transform ${popoverOpen ? 'rotate-180' : ''}`}>
                  <polyline points="18 15 12 9 6 15"/>
                </svg>
              </button>
              <div className="mt-2 text-[10px] text-slate-700 text-center">OMYKB v1.0</div>
            </div>
          </>
        )}
      </div>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-hidden">
        {page === 'workspace' && activeWorkspaceId && (
          <Workspace
            key={activeWorkspaceId}
            workspaceId={activeWorkspaceId}
            workspaces={workspaces}
            onGoToSettings={() => { setSettingsSection('skills'); setPage('settings') }}
          />
        )}
        {page === 'workspace' && !activeWorkspaceId && (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-slate-500">
            <p className="text-sm">No workspaces yet.</p>
            <button onClick={() => setAddingWs(true)} className="btn-primary text-sm px-5">
              Create your first workspace
            </button>
          </div>
        )}
        {page === 'settings' && <Settings section={settingsSection} />}
      </main>
    </div>
  )
}
