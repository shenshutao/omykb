import { contextBridge, ipcRenderer } from 'electron'

// Expose safe API to renderer via window.omykb
contextBridge.exposeInMainWorld('omykb', {
  // Config
  getConfig: () => ipcRenderer.invoke('kb:get-config'),
  setConfig: (key: string, value: unknown) => ipcRenderer.invoke('kb:set-config', key, value),

  // Documents
  listDocuments: () => ipcRenderer.invoke('kb:list-documents'),
  getDocument: (id: string, workspaceId?: string) => ipcRenderer.invoke('kb:get-document', id, workspaceId),
  deleteDocument: (id: string, workspaceId?: string) => ipcRenderer.invoke('kb:delete-document', id, workspaceId),
  pickFile: () => ipcRenderer.invoke('kb:pick-file'),
  addDocument: (payload: { type: 'text' | 'file' | 'url'; content: string; title?: string }) =>
    ipcRenderer.invoke('kb:add-document', payload),
  ingestSource: (payload: {
    type: 'text' | 'url' | 'git' | 'file'
    content: string
    title?: string
    workspaceId?: string
    options?: { crawl?: boolean; maxPages?: number; maxDepth?: number }
  }) => ipcRenderer.invoke('kb:ingest-source', payload),

  // Agent chat
  sendMessage: (messages: Array<{ role: string; content: string }>) =>
    ipcRenderer.invoke('kb:send-message', messages),

  // Stream events
  onStreamChunk: (cb: (chunk: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, chunk: string) => cb(chunk)
    ipcRenderer.on('stream:chunk', handler)
    return () => ipcRenderer.removeListener('stream:chunk', handler)
  },
  onStreamDone: (cb: (usage: { inputTokens: number; outputTokens: number }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, usage: unknown) => cb(usage as { inputTokens: number; outputTokens: number })
    ipcRenderer.on('stream:done', handler)
    return () => ipcRenderer.removeListener('stream:done', handler)
  },
  onStreamError: (cb: (error: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, error: string) => cb(error)
    ipcRenderer.on('stream:error', handler)
    return () => ipcRenderer.removeListener('stream:error', handler)
  },
  onToolUse: (cb: (tool: { name: string; input: unknown }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, tool: unknown) => cb(tool as { name: string; input: unknown })
    ipcRenderer.on('stream:tool', handler)
    return () => ipcRenderer.removeListener('stream:tool', handler)
  },

  // Skills
  listSkills: () => ipcRenderer.invoke('kb:list-skills'),
  getSkill: (name: string) => ipcRenderer.invoke('kb:get-skill', name),
  saveSkill: (source: string, content: string) => ipcRenderer.invoke('kb:save-skill', source, content),

  // Workspaces
  listWorkspaces: () => ipcRenderer.invoke('kb:list-workspaces'),
  createWorkspace: (name: string) => ipcRenderer.invoke('kb:create-workspace', name),
  deleteWorkspace: (id: string) => ipcRenderer.invoke('kb:delete-workspace', id),
  renameWorkspace: (id: string, name: string) => ipcRenderer.invoke('kb:rename-workspace', id, name),
  listDocumentsInWorkspace: (workspaceId: string) => ipcRenderer.invoke('kb:list-documents-in-workspace', workspaceId),
  moveDocument: (docId: string, fromWorkspaceId: string, toWorkspaceId: string) => ipcRenderer.invoke('kb:move-document', docId, fromWorkspaceId, toWorkspaceId),

  // Platform
  platform: process.platform,
})
