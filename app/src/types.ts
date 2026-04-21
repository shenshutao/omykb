export interface Workspace {
  id: string
  name: string
}

export interface Document {
  id: string
  title: string
  tags: string[]
  addedAt: string
  size?: number
  source?: string
  type?: string
  path?: string
  wordCount?: number
  chunkCount?: number
  summary?: string
}

export interface KBConfig {
  provider: 'anthropic' | 'openai'
  apiKey: string
  model: string
  storagePath: string
  systemPrompt?: string
  baseURL?: string
  chatModel?: string
  ingestionModel?: string
  curationModel?: string
  visionModel?: string
  asrProvider?: 'openai' | 'aliyun'
  asrApiKey?: string
  asrModel?: string
  asrBaseURL?: string
  setupCompleted?: boolean
}

export interface Skill {
  name: string
  command: string
  description: string
  source: string
}

export interface SkillFull extends Skill {
  content: string
}

export interface IngestSourcePayload {
  type: 'text' | 'url' | 'git' | 'file'
  content: string
  title?: string
  workspaceId?: string
  options?: {
    crawl?: boolean
    maxPages?: number
    maxDepth?: number
  }
}

export interface IngestResult {
  id: string
  title: string
  path: string
  source: string
  type: string
  wordCount: number
  chunkCount: number
  summary?: string
  ingestionMode?: 'skill' | 'fallback'
  toolTrace?: ToolEvent[]
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolEvents?: ToolEvent[]
  activeSkill?: string
  usage?: { inputTokens: number; outputTokens: number }
}

export interface ToolEvent {
  name: string
  input: unknown
}

declare global {
  interface Window {
    omykb: {
      getConfig: () => Promise<KBConfig>
      setConfig: (key: string, value: unknown) => Promise<KBConfig>
      listDocuments: () => Promise<Document[]>
      getDocument: (id: string, workspaceId?: string) => Promise<string | null>
      deleteDocument: (id: string, workspaceId?: string) => Promise<{ deleted: string }>
      pickFile: () => Promise<string | null>
      addDocument: (payload: {
        type: 'text' | 'file' | 'url'
        content: string
        title?: string
      }) => Promise<{ id: string; title: string } | { error: string }>
      ingestSource: (payload: IngestSourcePayload) => Promise<IngestResult | { error: string }>
      sendMessage: (
        messages: Array<{ role: string; content: string }>
      ) => Promise<{ ok?: boolean; error?: string }>
      onStreamChunk: (cb: (chunk: string) => void) => () => void
      onStreamDone: (cb: (usage: { inputTokens: number; outputTokens: number }) => void) => () => void
      onStreamError: (cb: (error: string) => void) => () => void
      onToolUse: (cb: (tool: { name: string; input: unknown }) => void) => () => void
      listSkills: () => Promise<Skill[]>
      getSkill: (name: string) => Promise<SkillFull | null>
      saveSkill: (source: string, content: string) => Promise<{ ok: boolean }>
      listWorkspaces: () => Promise<Workspace[]>
      createWorkspace: (name: string) => Promise<Workspace>
      deleteWorkspace: (id: string) => Promise<{ deleted: string }>
      renameWorkspace: (id: string, name: string) => Promise<Workspace>
      listDocumentsInWorkspace: (workspaceId: string) => Promise<Document[]>
      moveDocument: (docId: string, fromWorkspaceId: string, toWorkspaceId: string) => Promise<{ ok: boolean }>
      platform: string
      recorder: {
        transcribeChunk: (bytes: number[], ext: string) => Promise<{ text?: string; error?: string }>
        translate: (text: string, targetLangCode: string) => Promise<{ text?: string; error?: string }>
        summarize: (segments: string[]) => Promise<{ text?: string; error?: string }>
      }
    }
  }
}
