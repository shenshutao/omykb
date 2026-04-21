import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { runAgentStream, KBConfig, ingestSourceToKB, IngestSourcePayload } from './agent'
import { registerAudioRecorderHandlers } from './plugins/audio-recorder'

const isDev = process.env.NODE_ENV === 'development'

app.name = 'OMYKB'
app.setName('OMYKB')

// Default KB storage in ~/Documents/omykb
function getDefaultStoragePath(): string {
  return path.join(app.getPath('documents'), 'omykb')
}

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'config.json')
}

function loadConfig(): KBConfig {
  const cfgPath = getConfigPath()
  const defaults: KBConfig = {
    provider: 'anthropic',
    apiKey: '',
    model: 'claude-opus-4-6',
    storagePath: getDefaultStoragePath(),
    systemPrompt: '',
    baseURL: '',
    chatModel: 'claude-opus-4-6',
    ingestionModel: '',
    curationModel: '',
    visionModel: '',
    asrProvider: 'openai',
    asrApiKey: '',
    asrModel: 'whisper-1',
    asrBaseURL: '',
    setupCompleted: false,
  }
  if (!fs.existsSync(cfgPath)) return defaults
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) }
  } catch {
    return defaults
  }
}

function saveConfig(cfg: KBConfig): void {
  fs.writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2))
}

function ensureKBStructure(storagePath: string): void {
  fs.mkdirSync(path.join(storagePath, '.omykb'), { recursive: true })
  fs.mkdirSync(path.join(storagePath, 'knowledge'), { recursive: true })
  const indexPath = path.join(storagePath, '.omykb', 'index.json')
  if (!fs.existsSync(indexPath)) {
    fs.writeFileSync(indexPath, JSON.stringify({ version: 1, documents: [] }, null, 2))
  }
}

function loadIndex(storagePath: string): { version?: number; documents: Array<Record<string, unknown>> } {
  const indexPath = path.join(storagePath, '.omykb', 'index.json')
  if (!fs.existsSync(indexPath)) return { version: 1, documents: [] }
  return JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
}

function saveIndex(storagePath: string, index: { version?: number; documents: Array<Record<string, unknown>> }): void {
  const indexPath = path.join(storagePath, '.omykb', 'index.json')
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2))
}

function getDocumentPathById(storagePath: string, id: string): string | null {
  const index = loadIndex(storagePath)
  const doc = (index.documents || []).find(item => item.id === id)
  if (doc && typeof doc.path === 'string' && fs.existsSync(doc.path)) return doc.path
  const legacyPath = path.join(storagePath, 'knowledge', `${id}.md`)
  if (fs.existsSync(legacyPath)) return legacyPath
  return null
}

// ─── Workspaces ───────────────────────────────────────────────────────────────

interface WorkspaceRecord {
  id: string
  name: string
}

function getWorkspacesPath(): string {
  return path.join(app.getPath('userData'), 'workspaces.json')
}

function loadWorkspaces(): WorkspaceRecord[] {
  const p = getWorkspacesPath()
  if (!fs.existsSync(p)) return []
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return [] }
}

function saveWorkspaces(ws: WorkspaceRecord[]): void {
  fs.writeFileSync(getWorkspacesPath(), JSON.stringify(ws, null, 2))
}

function getWorkspaceStoragePath(baseStoragePath: string, workspaceId: string): string {
  return path.join(baseStoragePath, 'workspaces', workspaceId)
}

let mainWindow: BrowserWindow | null = null

function installApplicationMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'OMYKB',
      submenu: [
        { role: 'about', label: 'About OMYKB' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: 'Hide OMYKB' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit OMYKB' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'OMYKB',
    titleBarStyle: 'hiddenInset',
    vibrancy: 'sidebar',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev) {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist-renderer', 'index.html'))
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist-renderer', 'index.html'))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  app.name = 'OMYKB'
  app.setName('OMYKB')
  installApplicationMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// IPC Handlers

registerAudioRecorderHandlers(loadConfig)

ipcMain.handle('kb:get-config', () => {
  return loadConfig()
})

ipcMain.handle('kb:set-config', (_event, key: string, value: unknown) => {
  const cfg = loadConfig()
  ;(cfg as Record<string, unknown>)[key] = value
  saveConfig(cfg)
  return cfg
})

ipcMain.handle('kb:list-documents', () => {
  const cfg = loadConfig()
  ensureKBStructure(cfg.storagePath)
  const index = loadIndex(cfg.storagePath)
  return index.documents || []
})

ipcMain.handle('kb:get-document', (_event, id: string, workspaceId?: string) => {
  const cfg = loadConfig()
  const storagePath = workspaceId
    ? getWorkspaceStoragePath(cfg.storagePath, workspaceId)
    : cfg.storagePath
  const docPath = getDocumentPathById(storagePath, id)
  if (!docPath || !fs.existsSync(docPath)) return null
  return fs.readFileSync(docPath, 'utf-8')
})

ipcMain.handle('kb:delete-document', (_event, id: string, workspaceId?: string) => {
  const cfg = loadConfig()
  const storagePath = workspaceId
    ? getWorkspaceStoragePath(cfg.storagePath, workspaceId)
    : cfg.storagePath
  const docPath = getDocumentPathById(storagePath, id)
  if (docPath && fs.existsSync(docPath)) fs.unlinkSync(docPath)

  const index = loadIndex(storagePath)
  index.documents = (index.documents || []).filter((d: { id: string }) => d.id !== id)
  saveIndex(storagePath, index)
  return { deleted: id }
})

ipcMain.handle('kb:pick-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      {
        name: 'Supported sources',
        extensions: [
          'pdf', 'docx', 'pptx', 'xlsx', 'xls', 'csv', 'json', 'html', 'htm', 'xml', 'md', 'txt', 'ipynb',
          'png', 'jpg', 'jpeg', 'webp', 'gif',
          'mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'oga', 'opus',
          'mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'mpeg', 'mpg',
        ],
      },
      { name: 'All files', extensions: ['*'] },
    ],
  })
  if (result.canceled || !result.filePaths[0]) return null
  return result.filePaths[0]
})

ipcMain.handle(
  'kb:add-document',
  async (_event, payload: { type: 'text' | 'file' | 'url'; content: string; title?: string }) => {
    const cfg = loadConfig()
    try {
      ensureKBStructure(cfg.storagePath)
      return await ingestSourceToKB({
        type: payload.type,
        content: payload.content,
        title: payload.title,
      }, cfg)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { error: message }
    }
  }
)

function loadSkillContent(type: string): string | undefined {
  const skillName = `kb-import-${type}`
  const dirs = getSkillsDirs()
  for (const dir of dirs) {
    const filePath = path.join(dir, `${skillName}.md`)
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8')
    }
  }
  return undefined
}

ipcMain.handle('kb:ingest-source', async (_event, payload: IngestSourcePayload & { workspaceId?: string }) => {
  const cfg = loadConfig()
  const { workspaceId, ...rest } = payload
  const storagePath = workspaceId
    ? getWorkspaceStoragePath(cfg.storagePath, workspaceId)
    : cfg.storagePath
  try {
    ensureKBStructure(storagePath)
    // Load the type-specific skill and pass it as skillContent for the agent loop
    const skillContent = rest.skillContent ?? loadSkillContent(rest.type)
    return await ingestSourceToKB({ ...rest, skillContent }, { ...cfg, storagePath })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
})

// ─── Workspace IPC ───────────────────────────────────────────────────────────

ipcMain.handle('kb:list-workspaces', () => {
  return loadWorkspaces()
})

ipcMain.handle('kb:create-workspace', (_event, name: string) => {
  const ws = loadWorkspaces()
  const id = `ws_${Date.now()}`
  const record: WorkspaceRecord = { id, name }
  ws.push(record)
  saveWorkspaces(ws)
  const cfg = loadConfig()
  ensureKBStructure(getWorkspaceStoragePath(cfg.storagePath, id))
  return record
})

ipcMain.handle('kb:delete-workspace', (_event, id: string) => {
  const ws = loadWorkspaces().filter(w => w.id !== id)
  saveWorkspaces(ws)
  return { deleted: id }
})

ipcMain.handle('kb:rename-workspace', (_event, id: string, name: string) => {
  const ws = loadWorkspaces()
  const record = ws.find(w => w.id === id)
  if (record) { record.name = name; saveWorkspaces(ws) }
  return record || { id, name }
})

ipcMain.handle('kb:list-documents-in-workspace', (_event, workspaceId: string) => {
  const cfg = loadConfig()
  const wsPath = getWorkspaceStoragePath(cfg.storagePath, workspaceId)
  ensureKBStructure(wsPath)
  const index = loadIndex(wsPath)
  return index.documents || []
})

ipcMain.handle('kb:move-document', (_event, docId: string, fromWorkspaceId: string, toWorkspaceId: string) => {
  const cfg = loadConfig()
  const fromPath = getWorkspaceStoragePath(cfg.storagePath, fromWorkspaceId)
  const toPath = getWorkspaceStoragePath(cfg.storagePath, toWorkspaceId)
  ensureKBStructure(toPath)

  // Find doc in source index
  const fromIndex = loadIndex(fromPath)
  const docRecord = (fromIndex.documents || []).find((d: Record<string, unknown>) => d.id === docId)
  if (!docRecord) return { ok: false }

  // Move the file
  const srcFile = getDocumentPathById(fromPath, docId)
  if (srcFile && fs.existsSync(srcFile)) {
    const destFile = path.join(toPath, 'knowledge', path.basename(srcFile))
    fs.copyFileSync(srcFile, destFile)
    fs.unlinkSync(srcFile)
    docRecord.path = destFile
  }

  // Update indexes
  fromIndex.documents = (fromIndex.documents || []).filter((d: Record<string, unknown>) => d.id !== docId)
  saveIndex(fromPath, fromIndex)

  const toIndex = loadIndex(toPath)
  toIndex.documents = [...(toIndex.documents || []), docRecord]
  saveIndex(toPath, toIndex)

  return { ok: true }
})

// ─── Skills IPC ──────────────────────────────────────────────────────────────

interface Skill {
  name: string        // e.g. "kb-ask"
  command: string     // e.g. "/kb:ask"
  description: string
  content: string     // full markdown
  source: string      // file path
}

function parseSkillFrontmatter(raw: string): { name?: string; description?: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  const meta: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const [k, ...rest] = line.split(':')
    if (k && rest.length) meta[k.trim()] = rest.join(':').trim()
  }
  return meta
}

function getSkillsDirs(): string[] {
  const dirs: string[] = []
  // 1. Standard Claude Code skills dir
  const claudeSkills = path.join(app.getPath('home'), '.claude', 'skills')
  if (fs.existsSync(claudeSkills)) dirs.push(claudeSkills)
  // 2. omykb bundled skills
  const devBundled = path.join(__dirname, '..', '..', 'skills')
  if (fs.existsSync(devBundled)) dirs.push(devBundled)
  const packagedBundled = path.join(process.resourcesPath, 'skills')
  if (fs.existsSync(packagedBundled)) dirs.push(packagedBundled)
  return dirs
}

function loadSkills(): Skill[] {
  const skills: Skill[] = []
  const seen = new Set<string>()

  for (const dir of getSkillsDirs()) {
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.md')) continue
      const filePath = path.join(dir, file)
      const content = fs.readFileSync(filePath, 'utf-8')
      const meta = parseSkillFrontmatter(content)
      const baseName = file.replace(/\.md$/, '')
      const name = meta.name || baseName

      if (seen.has(name)) continue
      seen.add(name)

      // command: kb-ask → /kb:ask, my-skill → /my:skill, plain → /plain
      const command = '/' + name.replace(/-([^-]+)$/, ':$1').replace(/-/g, '-')

      skills.push({
        name,
        command,
        description: meta.description || '',
        content,
        source: filePath,
      })
    }
  }

  return skills.sort((a, b) => a.command.localeCompare(b.command))
}

ipcMain.handle('kb:list-skills', () => {
  return loadSkills().map(s => ({
    name: s.name,
    command: s.command,
    description: s.description,
    source: s.source,
  }))
})

ipcMain.handle('kb:get-skill', (_event, name: string) => {
  const skill = loadSkills().find(s => s.name === name || s.command === name)
  return skill || null
})

ipcMain.handle('kb:save-skill', (_event, source: string, content: string) => {
  fs.writeFileSync(source, content, 'utf-8')
  return { ok: true }
})

ipcMain.handle('kb:send-message', async (event, messages: Array<{ role: string; content: string }>) => {
  const cfg = loadConfig()
  if (!cfg.apiKey) {
    return { error: 'No API key configured. Please add your Anthropic API key in Settings.' }
  }

  ensureKBStructure(cfg.storagePath)

  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return { error: 'No window' }

  try {
    await runAgentStream(
      messages as Array<{ role: 'user' | 'assistant'; content: string }>,
      cfg,
      win
    )
    return { ok: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    win.webContents.send('stream:error', message)
    return { error: message }
  }
})
