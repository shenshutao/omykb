import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { BrowserWindow } from 'electron'
import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as https from 'https'
import * as http from 'http'
import * as os from 'os'
import * as path from 'path'
import { URL } from 'url'
import JSZip from 'jszip'
import * as mammoth from 'mammoth'
import * as XLSX from 'xlsx'

export interface KBConfig {
  provider: 'anthropic' | 'openai'
  apiKey: string
  model: string
  storagePath: string
  systemPrompt?: string
  baseURL?: string  // for OpenAI-compatible endpoints
  chatModel?: string
  ingestionModel?: string
  curationModel?: string
  visionModel?: string
  asrProvider?: 'openai' | 'aliyun' | 'funasr-local'
  asrApiKey?: string
  asrModel?: string
  asrBaseURL?: string
  diarizeBaseURL?: string
  ossRegion?: string
  ossAccessKeyId?: string
  ossAccessKeySecret?: string
  ossBucket?: string
  setupCompleted?: boolean
}

export const DEFAULT_MODELS: Record<KBConfig['provider'], string> = {
  anthropic: 'claude-opus-4-6',
  openai: 'gpt-4o',
}

const DEFAULT_ASR_MODELS: Record<NonNullable<KBConfig['asrProvider']>, string> = {
  openai: 'whisper-1',
  aliyun: 'paraformer-v2',
  'funasr-local': '2pass',
}

export interface IngestSourcePayload {
  type: 'text' | 'url' | 'git' | 'file'
  content: string
  title?: string
  skillContent?: string
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
  toolTrace?: ToolTraceEntry[]
}

interface ExtractedSource {
  title: string
  rawContent: string
  source: string
  type: string
}

interface ToolExtractedResult extends ExtractedSource {
  warnings?: string[]
  quality?: 'poor' | 'fair' | 'good'
  images?: Array<{ url: string; alt: string }>
  note?: string
  local_path?: string
  image_path?: string
  pages?: Array<{ url: string; title: string; text: string; depth: number; images?: Array<{ url: string; alt: string }> }>
}

export interface ToolTraceEntry {
  name: string
  input: Record<string, unknown>
}

// ─── Tool definitions (shared schema) ────────────────────────────────────────

const TOOL_SCHEMAS = {
  list_documents: {
    description: 'List all documents in the knowledge base with their metadata (id, title, tags, date added).',
    parameters: {
      type: 'object' as const,
      properties: {
        filter: { type: 'string', description: 'Optional keyword filter for document titles or tags' },
      },
    },
  },
  read_document: {
    description: 'Read the full content of a specific document from the knowledge base.',
    parameters: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Document ID to read' },
      },
      required: ['id'],
    },
  },
  search_documents: {
    description: 'Search documents by keyword. Returns ranked results with snippets.',
    parameters: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results to return (default: 5)' },
      },
      required: ['query'],
    },
  },
  write_document: {
    description: 'Save a new document or update an existing one in the knowledge base.',
    parameters: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Document title' },
        content: { type: 'string', description: 'Document content in Markdown' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
        id: { type: 'string', description: 'If provided, update existing document with this ID' },
      },
      required: ['title', 'content'],
    },
  },
  fetch_url: {
    description: 'Fetch the text content from a URL (web page, article, documentation).',
    parameters: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
      },
      required: ['url'],
    },
  },
  crawl_site: {
    description: 'Recursively crawl a documentation site or website on the same domain and return extracted page content.',
    parameters: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'Starting URL to crawl' },
        max_pages: { type: 'number', description: 'Maximum pages to crawl (default: 10)' },
        max_depth: { type: 'number', description: 'Maximum link depth from the starting URL (default: 1)' },
      },
      required: ['url'],
    },
  },
  read_local_file: {
    description: 'Auto-detect a local file type and route to the appropriate parser tool. Returns a normalized extracted-source object.',
    parameters: {
      type: 'object' as const,
      properties: {
        file_path: { type: 'string', description: 'Absolute or relative path to the local file' },
      },
      required: ['file_path'],
    },
  },
  read_git_repository: {
    description: 'Clone or inspect a Git repository, extract key docs and code context, and return a condensed repository snapshot.',
    parameters: {
      type: 'object' as const,
      properties: {
        repo_url: { type: 'string', description: 'Git repository URL' },
      },
      required: ['repo_url'],
    },
  },
  ingest_source: {
    description: 'Fetch or read raw source content, curate it into structured Markdown, and store it in the knowledge base.',
    parameters: {
      type: 'object' as const,
      properties: {
        source_type: { type: 'string', enum: ['text', 'url', 'git', 'file'] },
        source: { type: 'string', description: 'Raw text, URL, repository URL, or file path' },
        title: { type: 'string', description: 'Optional preferred document title' },
        crawl: { type: 'boolean', description: 'For URL sources, recursively crawl the site on the same domain' },
        max_pages: { type: 'number', description: 'For URL crawl, maximum pages to fetch' },
        max_depth: { type: 'number', description: 'For URL crawl, maximum link depth' },
      },
      required: ['source_type', 'source'],
    },
  },
  read_pdf: {
    description: 'Extract text from a PDF file and return a normalized extracted-source object. Use pdf_to_image + describe_image if quality is poor.',
    parameters: {
      type: 'object' as const,
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the PDF file' },
      },
      required: ['file_path'],
    },
  },
  read_docx: {
    description: 'Extract text from a DOCX (Word) file and return a normalized extracted-source object.',
    parameters: {
      type: 'object' as const,
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the DOCX file' },
      },
      required: ['file_path'],
    },
  },
  read_pptx: {
    description: 'Extract text from a PPTX (PowerPoint) file slide by slide and return a normalized extracted-source object.',
    parameters: {
      type: 'object' as const,
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the PPTX file' },
      },
      required: ['file_path'],
    },
  },
  read_spreadsheet: {
    description: 'Extract data from a spreadsheet (XLSX, XLS, CSV) as Markdown-friendly CSV text and return a normalized extracted-source object.',
    parameters: {
      type: 'object' as const,
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the spreadsheet file' },
      },
      required: ['file_path'],
    },
  },
  pdf_to_image: {
    description: 'Convert the first page of a PDF to a PNG image file (useful when PDF text extraction is poor quality). Returns the path to the generated image file.',
    parameters: {
      type: 'object' as const,
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the PDF file' },
      },
      required: ['file_path'],
    },
  },
  describe_image: {
    description: 'Analyze an image using vision AI and produce the best knowledge-base representation. Automatically detects: flowcharts → Mermaid, sequence diagrams → Mermaid, tables → Markdown table, UI screenshots → description, photos → description, text-heavy images → extracted text.',
    parameters: {
      type: 'object' as const,
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the image file (PNG, JPG, WEBP, etc.)' },
        hint: { type: 'string', description: 'Optional hint about what the image contains or desired output format' },
      },
      required: ['file_path'],
    },
  },
  transcribe_audio: {
    description: 'Transcribe a local audio file to text and return a normalized extracted-source object. Requires an OpenAI-compatible audio transcription API key.',
    parameters: {
      type: 'object' as const,
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the audio file (MP3, WAV, M4A, AAC, FLAC, OGG, OPUS, etc.)' },
      },
      required: ['file_path'],
    },
  },
  transcribe_video: {
    description: 'Extract audio from a local video file with ffmpeg, transcribe it, and return a normalized extracted-source object.',
    parameters: {
      type: 'object' as const,
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the video file (MP4, MOV, M4V, MKV, WEBM, AVI, etc.)' },
      },
      required: ['file_path'],
    },
  },
  download_image: {
    description: 'Download an image from a URL to a temporary local file so it can be analyzed with describe_image. Returns the local file path.',
    parameters: {
      type: 'object' as const,
      properties: {
        image_url: { type: 'string', description: 'HTTP/HTTPS URL of the image to download' },
        alt_text: { type: 'string', description: 'Optional alt text or hint about the image content' },
      },
      required: ['image_url'],
    },
  },
  extract_text_file: {
    description: 'Extract content from a plain text, Markdown, HTML, XML, JSON, or code file and return a normalized extracted-source object.',
    parameters: {
      type: 'object' as const,
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the text-like file' },
      },
      required: ['file_path'],
    },
  },
  read_notebook: {
    description: 'Extract cells from a Jupyter notebook (.ipynb) and return a normalized extracted-source object.',
    parameters: {
      type: 'object' as const,
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the notebook file' },
      },
      required: ['file_path'],
    },
  },
}

// Anthropic tool format
const ANTHROPIC_TOOLS: Anthropic.Tool[] = Object.entries(TOOL_SCHEMAS).map(([name, def]) => ({
  name,
  description: def.description,
  input_schema: def.parameters,
}))

// OpenAI tool format
const OPENAI_TOOLS: OpenAI.Chat.ChatCompletionTool[] = Object.entries(TOOL_SCHEMAS).map(([name, def]) => ({
  type: 'function' as const,
  function: {
    name,
    description: def.description,
    parameters: def.parameters,
  },
}))

// ─── Tool implementations ─────────────────────────────────────────────────────

const TEXT_EXTENSIONS = new Set([
  '.md', '.mdx', '.txt', '.rst', '.html', '.htm', '.json', '.yaml', '.yml', '.xml',
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.java', '.sh',
  '.css', '.scss', '.sql', '.toml', '.ini',
])

const SPREADSHEET_EXTENSIONS = new Set(['.xlsx', '.xls', '.csv'])
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tiff'])
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.oga', '.opus', '.webm'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.avi', '.mpeg', '.mpg'])
const BINARY_DOC_EXTENSIONS = new Set(['.pdf', '.docx', '.pptx', '.ipynb'])

const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'coverage', '.next', 'target', '.cache',
])

function htmlEntityDecode(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function stripHtml(html: string): string {
  const withoutScripts = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
  const text = withoutScripts
    .replace(/<\/(p|div|section|article|li|h1|h2|h3|h4|h5|h6|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  return normalizeWhitespace(htmlEntityDecode(text))
}

function extractHtmlTitle(html: string, fallback: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return normalizeWhitespace(htmlEntityDecode(match?.[1] || '')) || fallback
}

function safeFileTitle(input: string): string {
  return input
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'Untitled'
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'document'
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

function extractFirstNonEmptyLine(text: string): string {
  return text.split('\n').map(line => line.trim()).find(Boolean) || ''
}

function looksLikeUsableTitle(line: string): boolean {
  if (!line) return false
  if (/^[{\["]/.test(line)) return false
  if (/^##\s+(markdown cell|code cell)/i.test(line)) return false
  if (/^output:?$/i.test(line)) return false
  return /[A-Za-z0-9\u4e00-\u9fff]/.test(line)
}

function inferTitleFromContent(fallbackTitle: string, rawContent: string): string {
  if (looksLikeUsableTitle(fallbackTitle)) {
    const firstChunk = normalizeWhitespace(rawContent).slice(0, 200).toLowerCase()
    if (firstChunk.startsWith(fallbackTitle.toLowerCase())) return fallbackTitle.slice(0, 80)
  }
  const heading = rawContent.match(/^#\s+(.+)$/m)?.[1]?.trim()
  if (heading && looksLikeUsableTitle(heading)) return heading.slice(0, 80)
  const markdownHeading = rawContent.match(/^##\s+(.+)$/m)?.[1]?.trim()
  if (markdownHeading && looksLikeUsableTitle(markdownHeading)) return markdownHeading.slice(0, 80)
  const candidateLines = rawContent.split('\n')
    .map(line => line.trim().replace(/^[-*]\s+/, '').replace(/^#+\s+/, ''))
    .filter(line => looksLikeUsableTitle(line))
  return (candidateLines[0] || fallbackTitle).slice(0, 80)
}

function resolveFallbackTitle(preferredTitle: string, rawContent: string, sourceType: string): string {
  if (looksLikeUsableTitle(preferredTitle)) {
    if (sourceType === 'url' || sourceType === 'web' || sourceType === 'git') {
      return preferredTitle.slice(0, 80)
    }
    const normalized = normalizeWhitespace(rawContent).toLowerCase()
    if (normalized.startsWith(preferredTitle.toLowerCase())) {
      return preferredTitle.slice(0, 80)
    }
  }
  return inferTitleFromContent(preferredTitle, rawContent)
}

function cleanTextForSummary(rawContent: string): string {
  return normalizeWhitespace(
    rawContent
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/^##\s+(Markdown Cell|Code Cell)\s+\d+\s*$/gim, ' ')
      .replace(/^Output:\s*$/gim, ' ')
      .replace(/^#\s+/gm, '')
  )
}

function inferSummary(rawContent: string): string {
  const sentences = cleanTextForSummary(rawContent)
    .split(/(?<=[.!?。！？])\s+/)
    .map(s => s.trim())
    .filter(Boolean)
  if (sentences.length >= 2) return `${sentences[0]} ${sentences[1]}`.slice(0, 280)
  if (sentences.length === 1) return sentences[0].slice(0, 280)
  return extractFirstNonEmptyLine(rawContent).slice(0, 280)
}

function inferTags(rawContent: string, sourceType: string): string[] {
  const text = rawContent.toLowerCase()
  const candidates = [
    'api', 'import', 'markdown', 'workspace', 'database', 'postgresql', 'temporal',
    'python', 'typescript', 'react', 'electron', 'json', 'spreadsheet', 'notebook',
    'documentation', 'diagram', 'architecture', 'deployment', 'testing'
  ]
  const matched = candidates.filter(tag => text.includes(tag)).slice(0, 5)
  if (!matched.includes(sourceType)) matched.unshift(sourceType)
  return [...new Set(matched)].slice(0, 6)
}

function buildFallbackMarkdown(title: string, rawContent: string, sourceType: string, source: string): { summary: string; tags: string[]; markdown: string } {
  const cleanTitle = resolveFallbackTitle(title, rawContent, sourceType)
  let summary = inferSummary(rawContent) || `Imported ${sourceType} content.`
  if (sourceType === 'json') {
    try {
      const parsed = JSON.parse(rawContent)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const keys = Object.keys(parsed).slice(0, 6)
        if (keys.length) summary = `JSON document with top-level keys: ${keys.join(', ')}.`
      }
    } catch {}
  }
  const tags = inferTags(rawContent, sourceType)
  const body = rawContent.trim().startsWith('#')
    ? rawContent.trim()
    : `# ${cleanTitle}\n\n## Content\n\n${rawContent.trim()}`

  const markdown = [
    `# ${cleanTitle}`,
    '',
    '## Summary',
    '',
    summary,
    '',
    body.startsWith(`# ${cleanTitle}`) ? body.replace(`# ${cleanTitle}`, '').trimStart() : body,
    '',
    '## Source Notes',
    '',
    `- Source type: ${sourceType}`,
    `- Source: ${source}`,
    '- Generated with local fallback curation because no model API key was configured.',
  ].join('\n')

  return { summary, tags, markdown }
}

function estimateChunks(text: string, chunkSize = 1800): number {
  return Math.max(1, Math.ceil(text.length / chunkSize))
}

function parseJsonObject<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T
  } catch {}

  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1)) as T
    } catch {}
  }

  return null
}

function fileExt(filePath: string): string {
  return path.extname(filePath).toLowerCase()
}

function getMimeTypeForImage(filePath: string): string {
  const ext = fileExt(filePath)
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.bmp':
      return 'image/bmp'
    case '.tiff':
      return 'image/tiff'
    default:
      return 'image/png'
  }
}

function getChatModel(cfg: KBConfig): string {
  return cfg.chatModel || cfg.model || DEFAULT_MODELS[cfg.provider]
}

function getIngestionModel(cfg: KBConfig): string {
  return cfg.ingestionModel || getChatModel(cfg)
}

function getCurationModel(cfg: KBConfig): string {
  return cfg.curationModel || getChatModel(cfg)
}

function getVisionModel(cfg: KBConfig): string {
  return cfg.visionModel || getChatModel(cfg)
}

function getAsrProvider(cfg?: KBConfig): NonNullable<KBConfig['asrProvider']> {
  return cfg?.asrProvider || 'openai'
}

function getAsrApiKey(cfg?: KBConfig): string {
  if (!cfg) return ''
  return cfg.asrApiKey || (getAsrProvider(cfg) === 'openai' ? cfg.apiKey : '')
}

function getAsrModel(cfg?: KBConfig): string {
  const provider = getAsrProvider(cfg)
  return cfg?.asrModel || DEFAULT_ASR_MODELS[provider]
}

function getAsrBaseURL(cfg?: KBConfig): string {
  const provider = getAsrProvider(cfg)
  return cfg?.asrBaseURL || (provider === 'aliyun' ? 'https://dashscope.aliyuncs.com' : (cfg?.baseURL || ''))
}

function isHttpUrl(input: string): boolean {
  return /^https?:\/\//i.test(input)
}

function extensionFromSource(source: string): string {
  try {
    return path.extname(isHttpUrl(source) ? new URL(source).pathname : source).toLowerCase()
  } catch {
    return path.extname(source).toLowerCase()
  }
}

function getMediaDuration(filePath: string): string | undefined {
  if (!commandExists('ffprobe')) return undefined
  try {
    const raw = execFileSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    const seconds = Number(raw)
    if (!Number.isFinite(seconds)) return undefined
    const mins = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  } catch {
    return undefined
  }
}

function buildExtractedResult(source: string, type: string, title: string, rawContent: string, extra?: Partial<ToolExtractedResult>): ToolExtractedResult {
  return {
    source,
    type,
    title,
    rawContent: rawContent.slice(0, 50000),
    ...extra,
  }
}

function getIndex(storagePath: string): { version?: number; documents: Array<Record<string, unknown>> } {
  const indexPath = path.join(storagePath, '.omykb', 'index.json')
  if (!fs.existsSync(indexPath)) return { version: 1, documents: [] }
  return JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
}

function findDocMeta(storagePath: string, id: string): Record<string, unknown> | undefined {
  const index = getIndex(storagePath)
  return (index.documents || []).find(doc => doc.id === id)
}

function getDocumentPath(storagePath: string, id: string): string | null {
  const meta = findDocMeta(storagePath, id)
  const explicitPath = typeof meta?.path === 'string' ? meta.path : null
  if (explicitPath && fs.existsSync(explicitPath)) return explicitPath

  const legacyPath = path.join(storagePath, 'knowledge', `${id}.md`)
  if (fs.existsSync(legacyPath)) return legacyPath
  return null
}

function ensureKBDirs(storagePath: string): void {
  fs.mkdirSync(path.join(storagePath, '.omykb'), { recursive: true })
  fs.mkdirSync(path.join(storagePath, 'knowledge'), { recursive: true })
}

function commandExists(command: string): boolean {
  try {
    execFileSync('which', [command], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function fetchUrlRaw(url: string): Promise<{ url: string; title: string; html: string; text: string; images: Array<{ url: string; alt: string }> }> {
  return new Promise(resolve => {
    const mod = url.startsWith('https') ? https : http
    mod.get(url, { headers: { 'User-Agent': 'omykb/1.0' } }, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        const title = extractHtmlTitle(data, url)
        const images = extractImageUrls(data, url)
        resolve({
          url,
          title,
          html: data,
          text: stripHtml(data).slice(0, 40000),
          images,
        })
      })
    }).on('error', err => resolve({
      url,
      title: url,
      html: '',
      text: `Failed to fetch URL: ${err.message}`,
      images: [],
    }))
  })
}

function extractLinks(html: string, currentUrl: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const current = new URL(currentUrl)
  const hrefRegex = /href\s*=\s*["']([^"'#]+)["']/gi

  for (const match of html.matchAll(hrefRegex)) {
    try {
      const normalized = new URL(match[1], currentUrl)
      if (!['http:', 'https:'].includes(normalized.protocol)) continue
      if (normalized.hostname !== current.hostname) continue
      normalized.hash = ''
      const href = normalized.toString()
      if (seen.has(href)) continue
      seen.add(href)
      out.push(href)
    } catch {}
  }

  return out
}

function extractImageUrls(html: string, baseUrl: string): Array<{ url: string; alt: string }> {
  const out: Array<{ url: string; alt: string }> = []
  const seen = new Set<string>()
  const imgRegex = /<img[^>]+>/gi
  const srcRegex = /src\s*=\s*["']([^"']+)["']/i
  const altRegex = /alt\s*=\s*["']([^"']*)["']/i

  for (const imgTag of html.matchAll(imgRegex)) {
    const srcMatch = imgTag[0].match(srcRegex)
    if (!srcMatch) continue
    const altMatch = imgTag[0].match(altRegex)
    const alt = altMatch?.[1] || ''
    try {
      const normalized = new URL(srcMatch[1], baseUrl)
      if (!['http:', 'https:'].includes(normalized.protocol)) continue
      // Skip tiny icons: if URL looks like favicon/icon/logo-small skip
      const urlStr = normalized.toString()
      if (seen.has(urlStr)) continue
      seen.add(urlStr)
      out.push({ url: urlStr, alt })
    } catch {}
  }
  return out.slice(0, 20) // cap at 20 images per page
}

async function crawlSite(url: string, maxPages = 10, maxDepth = 1): Promise<ToolExtractedResult> {
  const queue: Array<{ url: string; depth: number }> = [{ url, depth: 0 }]
  const seen = new Set<string>()
  const pages: Array<{ url: string; title: string; text: string; depth: number; images?: Array<{ url: string; alt: string }> }> = []

  while (queue.length > 0 && pages.length < maxPages) {
    const current = queue.shift()
    if (!current || seen.has(current.url)) continue
    seen.add(current.url)

    const fetched = await fetchUrlRaw(current.url)
    if (!fetched.text) continue

    pages.push({
      url: current.url,
      title: fetched.title,
      text: fetched.text.slice(0, 12000),
      depth: current.depth,
      images: current.depth === 0 ? fetched.images : [],
    })

    if (current.depth >= maxDepth) continue

    for (const link of extractLinks(fetched.html, current.url)) {
      if (!seen.has(link) && queue.length + pages.length < maxPages * 3) {
        queue.push({ url: link, depth: current.depth + 1 })
      }
    }
  }

  const combined = pages.map((page, index) => {
    const imgNote = page.images?.length
      ? `\n\nImages on this page (${page.images.length}): ${page.images.map(i => `[${i.alt || 'image'}](${i.url})`).join(', ')}`
      : ''
    return `## Page ${index + 1}: ${page.title}\nURL: ${page.url}\n\n${page.text}${imgNote}`
  }).join('\n\n---\n\n')

  return buildExtractedResult(
    url,
    'web',
    pages[0]?.title || url,
    combined,
    {
      pages,
      images: pages[0]?.images || [],
      note: `Crawled ${pages.length} page(s) from the same domain.`,
    }
  )
}

function isTextLikeFile(filePath: string): boolean {
  const ext = fileExt(filePath)
  return TEXT_EXTENSIONS.has(ext)
    || SPREADSHEET_EXTENSIONS.has(ext)
    || IMAGE_EXTENSIONS.has(ext)
    || AUDIO_EXTENSIONS.has(ext)
    || VIDEO_EXTENSIONS.has(ext)
    || BINARY_DOC_EXTENSIONS.has(ext)
}

async function describeImageFile(filePath: string, cfg?: KBConfig): Promise<string> {
  const resolved = path.resolve(filePath)
  if (!cfg?.apiKey) {
    return `Image source imported from ${resolved}. Configure an AI provider to extract visual content.`
  }

  const base64 = fs.readFileSync(resolved).toString('base64')
  const prompt = 'Describe this image for a knowledge base. Extract visible text, layout, key entities, diagrams, and any actionable details. Return concise Markdown.'

  if (cfg.provider === 'openai') {
    const client = new OpenAI({
      apiKey: cfg.apiKey,
      ...(cfg.baseURL ? { baseURL: cfg.baseURL } : {}),
    })
    const response = await client.chat.completions.create({
      model: getVisionModel(cfg),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: `data:${getMimeTypeForImage(resolved)};base64,${base64}` },
            },
          ],
        },
      ],
      temperature: 0.2,
    })
    return response.choices[0]?.message?.content || `Image source imported from ${resolved}.`
  }

  const client = new Anthropic({ apiKey: cfg.apiKey })
  const response = await client.messages.create({
    model: getVisionModel(cfg),
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: getMimeTypeForImage(resolved) as Anthropic.Base64ImageSource['media_type'],
            data: base64,
          },
        },
      ],
    }],
  })
  return response.content.filter(block => block.type === 'text').map(block => block.text).join('\n') || `Image source imported from ${resolved}.`
}

// New: download a remote image to a local temp file
async function toolDownloadImage(imageUrl: string, altText?: string): Promise<string> {
  try {
    const parsed = new URL(imageUrl)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return JSON.stringify({ error: 'Only http/https URLs are supported' })
    }
    const ext = path.extname(parsed.pathname).toLowerCase() || '.png'
    const allowed = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tiff'])
    const safeExt = allowed.has(ext) ? ext : '.png'
    const tmpPath = path.join(os.tmpdir(), `omykb-img-${Date.now()}${safeExt}`)

    await new Promise<void>((resolve, reject) => {
      const mod = imageUrl.startsWith('https') ? https : http
      const req = mod.get(imageUrl, { headers: { 'User-Agent': 'omykb/1.0' } }, res => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          fs.writeFileSync(tmpPath, Buffer.concat(chunks))
          resolve()
        })
        res.on('error', reject)
      })
      req.on('error', reject)
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')) })
    })

    const stat = fs.statSync(tmpPath)
    if (stat.size < 500) {
      fs.unlinkSync(tmpPath)
      return JSON.stringify({ error: 'Downloaded file too small — likely not a real image' })
    }

    return JSON.stringify({
      local_path: tmpPath,
      size_bytes: stat.size,
      hint: altText || undefined,
      note: 'Pass local_path to describe_image. The file will persist until next restart.',
    })
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
  }
}

// New: tool-callable PDF reader
async function toolReadPdf(filePath: string): Promise<string> {
  try {
    const resolved = path.resolve(filePath)
    if (!fs.existsSync(resolved)) return JSON.stringify({ error: `File not found: ${resolved}` })
    const req = (0, eval)('require') as NodeRequire
    const { PDFParse } = req('pdf-parse') as {
      PDFParse: new (params: { data: Buffer }) => { getText: () => Promise<{ text?: string }>; destroy: () => Promise<void> }
    }
    const parser = new PDFParse({ data: fs.readFileSync(resolved) })
    const parsed = await parser.getText()
    await parser.destroy()
    const text = normalizeWhitespace(parsed.text || '')
    const quality = text.length < 200 ? 'poor' : text.length < 1000 ? 'fair' : 'good'
    return JSON.stringify(buildExtractedResult(
      resolved,
      'pdf',
      path.basename(resolved, path.extname(resolved)),
      text,
      {
        quality,
        warnings: quality === 'poor'
          ? ['Text extraction yielded little content. This may be a scanned PDF. Consider using pdf_to_image + describe_image.']
          : [],
      }
    ))
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
  }
}

// New: tool-callable DOCX reader
async function toolReadDocx(filePath: string): Promise<string> {
  try {
    const resolved = path.resolve(filePath)
    if (!fs.existsSync(resolved)) return JSON.stringify({ error: `File not found: ${resolved}` })
    const result = await mammoth.extractRawText({ path: resolved })
    const text = normalizeWhitespace(result.value || '')
    return JSON.stringify(buildExtractedResult(resolved, 'docx', path.basename(resolved, path.extname(resolved)), text))
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
  }
}

// New: tool-callable PPTX reader
async function toolReadPptx(filePath: string): Promise<string> {
  try {
    const resolved = path.resolve(filePath)
    if (!fs.existsSync(resolved)) return JSON.stringify({ error: `File not found: ${resolved}` })
    const text = normalizeWhitespace(await parsePptx(resolved))
    return JSON.stringify(buildExtractedResult(resolved, 'pptx', path.basename(resolved, path.extname(resolved)), text))
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
  }
}

// New: tool-callable spreadsheet reader
function toolReadSpreadsheet(filePath: string): string {
  try {
    const resolved = path.resolve(filePath)
    if (!fs.existsSync(resolved)) return JSON.stringify({ error: `File not found: ${resolved}` })
    const text = parseSpreadsheet(resolved)
    return JSON.stringify(buildExtractedResult(
      resolved,
      fileExt(resolved).replace(/^\./, '') || 'spreadsheet',
      path.basename(resolved, path.extname(resolved)),
      text
    ))
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
  }
}

// New: convert first PDF page to a PNG image via macOS qlmanage
function toolPdfToImage(filePath: string): string {
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved)) return JSON.stringify({ error: `File not found: ${resolved}` })
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omykb-pdfimg-'))
  try {
    execFileSync('qlmanage', ['-t', '-s', '1400', '-o', tmpDir, resolved], { stdio: 'ignore' })
    const files = fs.readdirSync(tmpDir).filter(f => /\.(png|jpg|jpeg)$/i.test(f))
    if (files.length === 0) return JSON.stringify({ error: 'qlmanage did not produce an image. Ensure the file is a valid PDF and qlmanage is available.' })
    const imgPath = path.join(tmpDir, files[0])
    // Move to a stable temp path (tmpDir will be cleaned up)
    const stablePath = path.join(os.tmpdir(), `omykb-pdf-preview-${Date.now()}.png`)
    fs.copyFileSync(imgPath, stablePath)
    return JSON.stringify({ image_path: stablePath, note: 'Pass image_path to describe_image. Delete the file after use.' })
  } catch (e) {
    return JSON.stringify({ error: `pdf_to_image failed: ${e instanceof Error ? e.message : String(e)}` })
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

// New: smart image description using vision model
async function toolDescribeImage(filePath: string, hint: string | undefined, cfg: KBConfig): Promise<string> {
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved)) return JSON.stringify({ error: `File not found: ${resolved}` })
  if (!cfg.apiKey) return JSON.stringify({ error: 'No API key configured. Cannot use vision model.' })

  const base64 = fs.readFileSync(resolved).toString('base64')
  const mime = getMimeTypeForImage(resolved)

  const systemPrompt = `You are a knowledge-base content extractor. Analyze images and produce the most useful knowledge-base representation.`
  const userPrompt = [
    'Analyze this image and produce the best knowledge-base Markdown representation.',
    hint ? `Context hint: ${hint}` : '',
    '',
    'Detection rules (apply the FIRST matching type):',
    '1. FLOWCHART / PROCESS DIAGRAM → output a Mermaid flowchart (```mermaid\\ngraph TD\\n...```)',
    '2. SEQUENCE DIAGRAM → output Mermaid sequenceDiagram',
    '3. CLASS / ENTITY / ER DIAGRAM → output Mermaid classDiagram or erDiagram',
    '4. ARCHITECTURE / SYSTEM DIAGRAM → output Mermaid graph or PlantUML @startuml/@enduml',
    '5. STATE MACHINE DIAGRAM → output Mermaid stateDiagram-v2',
    '6. TABLE / SPREADSHEET → output a Markdown table',
    '7. CHART / GRAPH (bar, line, pie, scatter) → describe data with values in Markdown prose + table if applicable',
    '8. SCREENSHOT / UI → describe UI elements, layout, and visible text as Markdown prose',
    '9. TEXT-HEAVY IMAGE (document scan, whiteboard with text) → extract ALL visible text verbatim',
    '10. PHOTO / ILLUSTRATION → concise Markdown description',
    '',
    'Start your response with a comment: `<!-- image-type: <detected type> -->`',
    'Then output ONLY the Markdown content, no preamble or explanation.',
  ].filter(Boolean).join('\n')

  try {
    if (cfg.provider === 'openai') {
      const client = new OpenAI({ apiKey: cfg.apiKey, ...(cfg.baseURL ? { baseURL: cfg.baseURL } : {}) })
      const response = await client.chat.completions.create({
        model: getVisionModel(cfg),
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
            ],
          },
        ],
      })
      const content = response.choices[0]?.message?.content || ''
      return JSON.stringify(buildExtractedResult(resolved, 'image', path.basename(resolved, path.extname(resolved)), content, {
        note: hint,
      }))
    } else {
      const client = new Anthropic({ apiKey: cfg.apiKey })
      const response = await client.messages.create({
        model: getVisionModel(cfg),
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            { type: 'image', source: { type: 'base64', media_type: mime as Anthropic.Base64ImageSource['media_type'], data: base64 } },
          ],
        }],
      })
      const content = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
      return JSON.stringify(buildExtractedResult(resolved, 'image', path.basename(resolved, path.extname(resolved)), content, {
        note: hint,
      }))
    }
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
  }
}

function toolExtractTextFile(filePath: string): string {
  try {
    const resolved = path.resolve(filePath)
    if (!fs.existsSync(resolved)) return JSON.stringify({ error: `File not found: ${resolved}` })
    const ext = fileExt(resolved)
    if (!TEXT_EXTENSIONS.has(ext)) return JSON.stringify({ error: `Unsupported text-like file: ${ext || 'unknown'}` })

    let content = fs.readFileSync(resolved, 'utf-8')
    let title = path.basename(resolved, path.extname(resolved))
    const warnings: string[] = []
    if (ext === '.html' || ext === '.htm' || ext === '.xml') {
      if (ext === '.html' || ext === '.htm') {
        title = extractHtmlTitle(content, title)
      }
      content = stripHtml(content)
      warnings.push('HTML/XML markup stripped to readable text.')
    } else if (ext === '.json') {
      try {
        const parsed = JSON.parse(content)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const keys = Object.keys(parsed).slice(0, 3)
          if (keys.length) title = `${title}: ${keys.join(', ')}`
        }
        content = JSON.stringify(JSON.parse(content), null, 2)
      } catch {
        warnings.push('JSON file was not valid JSON; raw text was preserved.')
      }
    }

    return JSON.stringify(buildExtractedResult(
      resolved,
      ext.replace(/^\./, '') || 'text',
      title,
      content,
      { warnings }
    ))
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
  }
}

function toolReadNotebook(filePath: string): string {
  try {
    const resolved = path.resolve(filePath)
    if (!fs.existsSync(resolved)) return JSON.stringify({ error: `File not found: ${resolved}` })
    const text = parseNotebook(resolved)
    return JSON.stringify(buildExtractedResult(resolved, 'ipynb', path.basename(resolved, path.extname(resolved)), text))
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
  }
}

async function transcribeAudioFile(filePath: string, cfg?: KBConfig): Promise<ToolExtractedResult> {
  const isRemote = isHttpUrl(filePath)
  const resolved = isRemote ? filePath : path.resolve(filePath)
  const titleSource = isRemote ? new URL(filePath).pathname : resolved
  const title = path.basename(titleSource, path.extname(titleSource)) || 'Audio'
  const duration = isRemote ? undefined : getMediaDuration(resolved)
  const provider = getAsrProvider(cfg)
  const asrApiKey = getAsrApiKey(cfg)

  if (!isRemote && !fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`)
  }

  if (!asrApiKey) {
    return buildExtractedResult(
      resolved,
      'audio',
      title,
      [
        `# ${title}`,
        '',
        'Audio file imported, but no transcript was generated.',
        '',
        '## Source Notes',
        '',
        `- Source: ${resolved}`,
        duration ? `- Duration: ${duration}` : undefined,
        `- Configure ${provider === 'aliyun' ? 'a DashScope' : 'an OpenAI'} ASR API key to enable audio transcription.`,
      ].filter(Boolean).join('\n'),
      {
        quality: 'poor',
        warnings: [`Audio transcription requires ${provider === 'aliyun' ? 'DashScope' : 'OpenAI'} ASR configuration.`],
      }
    )
  }

  let transcript = ''
  if (provider === 'aliyun') {
    if (!isRemote) {
      return buildExtractedResult(
        resolved,
        'audio',
        title,
        [
          `# ${title}`,
          '',
          'Audio file imported, but Aliyun ASR was not run because DashScope recorded-file recognition requires an HTTP/HTTPS file URL.',
          '',
          '## Source Notes',
          '',
          `- Source: ${resolved}`,
          '- Use a publicly reachable or signed OSS URL for Aliyun ASR, or switch ASR provider to OpenAI for local file transcription.',
        ].join('\n'),
        {
          quality: 'poor',
          warnings: ['Aliyun ASR requires file_urls over HTTP/HTTPS for recorded-file transcription.'],
        }
      )
    }
    transcript = await transcribeAliyunFileUrl(resolved, cfg!)
  } else {
    if (isRemote) {
      return buildExtractedResult(
        resolved,
        'audio',
        title,
        [
          `# ${title}`,
          '',
          'Audio URL imported, but OpenAI local-file transcription cannot read remote URLs directly.',
          '',
          '## Source Notes',
          '',
          `- Source: ${resolved}`,
          '- Switch ASR provider to Aliyun for URL-based media transcription, or download the file and import it locally.',
        ].join('\n'),
        {
          quality: 'poor',
          warnings: ['OpenAI ASR path currently expects a local file.'],
        }
      )
    }
    const client = new OpenAI({
      apiKey: asrApiKey,
      ...(cfg?.baseURL ? { baseURL: cfg.baseURL } : {}),
    })
    const response = await client.audio.transcriptions.create({
      file: fs.createReadStream(resolved),
      model: getAsrModel(cfg),
    })
    transcript = normalizeWhitespace(response.text || '')
  }
  return buildExtractedResult(
    resolved,
    'audio',
    title,
    [
      `# Transcript: ${title}`,
      '',
      duration ? `Duration: ${duration}` : undefined,
      '',
      '## Transcript',
      '',
      transcript || 'No speech was detected in this audio file.',
    ].filter(Boolean).join('\n'),
    {
      quality: transcript.length < 200 ? 'fair' : 'good',
      warnings: transcript ? [] : ['No speech was detected or transcription returned empty text.'],
    }
  )
}

function extractAudioFromVideo(filePath: string): string {
  if (!commandExists('ffmpeg')) {
    throw new Error('ffmpeg is required to extract audio from video files.')
  }
  const resolved = path.resolve(filePath)
  const output = path.join(os.tmpdir(), `omykb-video-audio-${Date.now()}.mp3`)
  execFileSync('ffmpeg', [
    '-y',
    '-i', resolved,
    '-vn',
    '-acodec', 'libmp3lame',
    '-ar', '16000',
    '-ac', '1',
    output,
  ], { stdio: 'ignore' })
  return output
}

async function dashScopeJson(url: string, apiKey: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init?.headers || {}),
    },
  })
  const text = await response.text()
  let parsed: Record<string, unknown> = {}
  try { parsed = JSON.parse(text) as Record<string, unknown> } catch {}
  if (!response.ok) {
    const message = typeof parsed.message === 'string' ? parsed.message : text
    throw new Error(`DashScope request failed (${response.status}): ${message}`)
  }
  return parsed
}

async function transcribeAliyunFileUrl(fileUrl: string, cfg: KBConfig): Promise<string> {
  const baseURL = getAsrBaseURL(cfg).replace(/\/+$/, '')
  const apiKey = getAsrApiKey(cfg)
  const submit = await dashScopeJson(`${baseURL}/api/v1/services/audio/asr/transcription`, apiKey, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify({
      model: getAsrModel(cfg),
      input: { file_urls: [fileUrl] },
    }),
  })
  const output = submit.output as Record<string, unknown> | undefined
  const taskId = typeof output?.task_id === 'string' ? output.task_id : ''
  if (!taskId) throw new Error('DashScope ASR did not return task_id.')

  let task: Record<string, unknown> | null = null
  for (let attempt = 0; attempt < 45; attempt++) {
    await new Promise(resolve => setTimeout(resolve, attempt < 5 ? 1500 : 3000))
    task = await dashScopeJson(`${baseURL}/api/v1/tasks/${taskId}`, apiKey, { method: 'POST' })
    const taskOutput = task.output as Record<string, unknown> | undefined
    const status = taskOutput?.task_status
    if (status === 'SUCCEEDED') break
    if (status === 'FAILED' || status === 'CANCELED') {
      throw new Error(`DashScope ASR task ${status}: ${JSON.stringify(taskOutput)}`)
    }
  }

  const taskOutput = task?.output as Record<string, unknown> | undefined
  if (taskOutput?.task_status !== 'SUCCEEDED') {
    throw new Error('DashScope ASR task did not finish before timeout.')
  }
  const results = Array.isArray(taskOutput.results) ? taskOutput.results as Array<Record<string, unknown>> : []
  const first = results.find(result => result.subtask_status === 'SUCCEEDED') || results[0]
  const transcriptUrl = typeof first?.transcription_url === 'string' ? first.transcription_url : ''
  if (!transcriptUrl) throw new Error(`DashScope ASR result missing transcription_url: ${JSON.stringify(first)}`)

  const transcriptResponse = await fetch(transcriptUrl)
  if (!transcriptResponse.ok) throw new Error(`Failed to download DashScope transcript (${transcriptResponse.status}).`)
  const transcriptJson = await transcriptResponse.json() as {
    transcripts?: Array<{ text?: string; sentences?: Array<{ text?: string }> }>
  }
  const text = (transcriptJson.transcripts || [])
    .map(item => item.text || (item.sentences || []).map(sentence => sentence.text || '').join('\n'))
    .filter(Boolean)
    .join('\n\n')
  return normalizeWhitespace(text)
}

async function transcribeVideoFile(filePath: string, cfg?: KBConfig): Promise<ToolExtractedResult> {
  const isRemote = isHttpUrl(filePath)
  const resolved = isRemote ? filePath : path.resolve(filePath)
  const titleSource = isRemote ? new URL(filePath).pathname : resolved
  const title = path.basename(titleSource, path.extname(titleSource)) || 'Video'
  const duration = isRemote ? undefined : getMediaDuration(resolved)
  const provider = getAsrProvider(cfg)
  const asrApiKey = getAsrApiKey(cfg)

  if (!isRemote && !fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`)
  }

  if (provider === 'aliyun') {
    if (!asrApiKey || !isRemote) {
      return buildExtractedResult(
        resolved,
        'video',
        title,
        [
          `# ${title}`,
          '',
          'Video file imported, but Aliyun ASR was not run.',
          '',
          '## Source Notes',
          '',
          `- Source: ${resolved}`,
          !asrApiKey ? '- Missing requirement: DashScope ASR API key.' : undefined,
          !isRemote ? '- Missing requirement: HTTP/HTTPS media URL. DashScope recorded-file recognition uses file_urls.' : undefined,
        ].filter(Boolean).join('\n'),
        {
          quality: 'poor',
          warnings: ['Aliyun video ASR requires a DashScope API key and an HTTP/HTTPS media URL.'],
        }
      )
    }
    const transcript = await transcribeAliyunFileUrl(resolved, cfg!)
    return buildExtractedResult(
      resolved,
      'video',
      title,
      [
        `# Transcript: ${title}`,
        '',
        '## Transcript',
        '',
        transcript || 'No speech was detected in this video file.',
      ].join('\n'),
      {
        quality: transcript.length < 200 ? 'fair' : 'good',
        warnings: transcript ? [] : ['No speech was detected or transcription returned empty text.'],
      }
    )
  }

  if (!asrApiKey || !commandExists('ffmpeg')) {
    const missing = [
      !asrApiKey ? 'OpenAI ASR API key' : '',
      !commandExists('ffmpeg') ? 'ffmpeg' : '',
    ].filter(Boolean).join(' and ')
    return buildExtractedResult(
      resolved,
      'video',
      title,
      [
        `# ${title}`,
        '',
        'Video file imported, but no transcript was generated.',
        '',
        '## Source Notes',
        '',
        `- Source: ${resolved}`,
        duration ? `- Duration: ${duration}` : undefined,
        `- Missing requirement: ${missing}.`,
        '- Configure an OpenAI provider API key and install ffmpeg to enable video transcription.',
      ].filter(Boolean).join('\n'),
      {
        quality: 'poor',
        warnings: [`Video transcription requires ${missing}.`],
      }
    )
  }

  let audioPath = ''
  try {
    audioPath = extractAudioFromVideo(resolved)
    const audioResult = await transcribeAudioFile(audioPath, cfg)
    return buildExtractedResult(
      resolved,
      'video',
      title,
      [
        `# Transcript: ${title}`,
        '',
        duration ? `Duration: ${duration}` : undefined,
        '',
        '## Transcript',
        '',
        audioResult.rawContent.replace(/^# Transcript: .+?\n\n/s, '').trim(),
      ].filter(Boolean).join('\n'),
      {
        quality: audioResult.quality,
        warnings: audioResult.warnings || [],
      }
    )
  } finally {
    if (audioPath) fs.rmSync(audioPath, { force: true })
  }
}

async function toolTranscribeAudio(filePath: string, cfg?: KBConfig): Promise<string> {
  try {
    return JSON.stringify(await transcribeAudioFile(filePath, cfg))
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
  }
}

async function toolTranscribeVideo(filePath: string, cfg?: KBConfig): Promise<string> {
  try {
    return JSON.stringify(await transcribeVideoFile(filePath, cfg))
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
  }
}

function tryMarkItDown(filePath: string): string | null {
  if (!commandExists('uvx')) return null
  try {
    const output = execFileSync('uvx', ['--from', 'markitdown', 'markitdown', filePath], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 20 * 1024 * 1024,
    })
    const text = normalizeWhitespace(output)
    return text || null
  } catch {
    return null
  }
}

async function parsePptx(filePath: string): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath))
  const slideNames = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  const slides: string[] = []
  for (const name of slideNames) {
    const xml = await zip.files[name].async('string')
    const texts = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)]
      .map(match => htmlEntityDecode(match[1]))
      .map(text => normalizeWhitespace(text))
      .filter(Boolean)
    if (texts.length) {
      slides.push(`## ${path.basename(name, '.xml')}\n\n- ${texts.join('\n- ')}`)
    }
  }

  return slides.join('\n\n')
}

function parseNotebook(filePath: string): string {
  const notebook = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as {
    cells?: Array<{ cell_type?: string; source?: string[] | string; outputs?: Array<{ text?: string[] | string }> }>
  }
  const sections: string[] = []

  for (const [index, cell] of (notebook.cells || []).entries()) {
    const source = Array.isArray(cell.source) ? cell.source.join('') : (cell.source || '')
    if (cell.cell_type === 'markdown') {
      sections.push(`## Markdown Cell ${index + 1}\n\n${source.trim()}`)
      continue
    }
    if (cell.cell_type === 'code') {
      const outputText = (cell.outputs || [])
        .map(output => Array.isArray(output.text) ? output.text.join('') : (output.text || ''))
        .filter(Boolean)
        .join('\n')
      sections.push(`## Code Cell ${index + 1}\n\n\`\`\`python\n${source.trim()}\n\`\`\`${outputText ? `\n\nOutput:\n\`\`\`\n${outputText.trim()}\n\`\`\`` : ''}`)
    }
  }

  return sections.join('\n\n')
}

function parseSpreadsheet(filePath: string): string {
  const workbook = XLSX.readFile(filePath, { dense: true })
  const sections: string[] = []
  for (const sheetName of workbook.SheetNames.slice(0, 8)) {
    const sheet = workbook.Sheets[sheetName]
    const csv = XLSX.utils.sheet_to_csv(sheet).trim()
    if (!csv) continue
    sections.push(`## Sheet: ${sheetName}\n\n\`\`\`csv\n${csv.slice(0, 12000)}\n\`\`\``)
  }
  return sections.join('\n\n')
}

async function parseBinaryFile(filePath: string, cfg?: KBConfig): Promise<string> {
  const ext = fileExt(filePath)
  const markItDownCandidate = new Set(['.pdf', '.docx', '.pptx', '.xlsx', '.xls', '.csv'])
  if (markItDownCandidate.has(ext)) {
    const converted = tryMarkItDown(filePath)
    if (converted) return converted
  }

  if (ext === '.pdf') {
    const req = (0, eval)('require') as NodeRequire
    const { PDFParse } = req('pdf-parse') as {
      PDFParse: new (params: { data: Buffer }) => { getText: () => Promise<{ text?: string }>; destroy: () => Promise<void> }
    }
    const parser = new PDFParse({ data: fs.readFileSync(filePath) })
    const parsed = await parser.getText()
    await parser.destroy()
    const text = normalizeWhitespace(parsed.text || '')
    return text || 'PDF imported, but no extractable text was found. This may be a scanned PDF and may need OCR.'
  }
  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath })
    return normalizeWhitespace(result.value || '')
  }
  if (ext === '.pptx') {
    return normalizeWhitespace(await parsePptx(filePath))
  }
  if (ext === '.ipynb') {
    return parseNotebook(filePath)
  }
  if (SPREADSHEET_EXTENSIONS.has(ext)) {
    return parseSpreadsheet(filePath)
  }
  if (IMAGE_EXTENSIONS.has(ext)) {
    return await describeImageFile(filePath, cfg)
  }
  if (AUDIO_EXTENSIONS.has(ext)) {
    return (await transcribeAudioFile(filePath, cfg)).rawContent
  }
  if (VIDEO_EXTENSIONS.has(ext)) {
    return (await transcribeVideoFile(filePath, cfg)).rawContent
  }
  return ''
}

async function readLocalFileContent(filePath: string, cfg?: KBConfig): Promise<{ title: string; content: string; source: string; type: string }> {
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved)) throw new Error(`File not found: ${resolved}`)
  if (!isTextLikeFile(resolved)) throw new Error(`Unsupported file type for direct ingestion: ${path.extname(resolved) || 'unknown'}`)

  const ext = fileExt(resolved)
  if (TEXT_EXTENSIONS.has(ext)) {
    const parsed = parseJsonObject<ToolExtractedResult>(toolExtractTextFile(resolved))
    if (!parsed?.rawContent) throw new Error(`Failed to extract text from ${resolved}`)
    return { title: parsed.title, content: parsed.rawContent, source: parsed.source, type: parsed.type }
  }
  if (ext === '.ipynb') {
    const parsed = parseJsonObject<ToolExtractedResult>(toolReadNotebook(resolved))
    if (!parsed?.rawContent) throw new Error(`Failed to extract notebook from ${resolved}`)
    return { title: parsed.title, content: parsed.rawContent, source: parsed.source, type: parsed.type }
  }
  if (ext === '.pdf') {
    const parsed = parseJsonObject<ToolExtractedResult>(await toolReadPdf(resolved))
    if (!parsed?.rawContent) throw new Error(`Failed to extract PDF from ${resolved}`)
    return { title: parsed.title, content: parsed.rawContent, source: parsed.source, type: parsed.type }
  }
  if (ext === '.docx') {
    const parsed = parseJsonObject<ToolExtractedResult>(await toolReadDocx(resolved))
    if (!parsed?.rawContent) throw new Error(`Failed to extract DOCX from ${resolved}`)
    return { title: parsed.title, content: parsed.rawContent, source: parsed.source, type: parsed.type }
  }
  if (ext === '.pptx') {
    const parsed = parseJsonObject<ToolExtractedResult>(await toolReadPptx(resolved))
    if (!parsed?.rawContent) throw new Error(`Failed to extract PPTX from ${resolved}`)
    return { title: parsed.title, content: parsed.rawContent, source: parsed.source, type: parsed.type }
  }
  if (SPREADSHEET_EXTENSIONS.has(ext)) {
    const parsed = parseJsonObject<ToolExtractedResult>(toolReadSpreadsheet(resolved))
    if (!parsed?.rawContent) throw new Error(`Failed to extract spreadsheet from ${resolved}`)
    return { title: parsed.title, content: parsed.rawContent, source: parsed.source, type: parsed.type }
  }
  if (IMAGE_EXTENSIONS.has(ext)) {
    if (cfg) {
      const parsed = parseJsonObject<ToolExtractedResult>(await toolDescribeImage(resolved, undefined, cfg))
      if (!parsed?.rawContent) throw new Error(`Failed to describe image ${resolved}`)
      return { title: parsed.title, content: parsed.rawContent, source: parsed.source, type: parsed.type }
    }
    const content = await describeImageFile(resolved, cfg)
    return { title: path.basename(resolved, path.extname(resolved)), content, source: resolved, type: 'image' }
  }
  if (AUDIO_EXTENSIONS.has(ext)) {
    const parsed = parseJsonObject<ToolExtractedResult>(await toolTranscribeAudio(resolved, cfg))
    if (!parsed?.rawContent) throw new Error(`Failed to transcribe audio ${resolved}`)
    return { title: parsed.title, content: parsed.rawContent, source: parsed.source, type: parsed.type }
  }
  if (VIDEO_EXTENSIONS.has(ext)) {
    const parsed = parseJsonObject<ToolExtractedResult>(await toolTranscribeVideo(resolved, cfg))
    if (!parsed?.rawContent) throw new Error(`Failed to transcribe video ${resolved}`)
    return { title: parsed.title, content: parsed.rawContent, source: parsed.source, type: parsed.type }
  }

  const content = await parseBinaryFile(resolved, cfg)
  return {
    title: path.basename(resolved, path.extname(resolved)),
    content: content.slice(0, 50000),
    source: resolved,
    type: ext.replace(/^\./, '') || 'file',
  }
}

function walkRepoFiles(rootDir: string, currentDir = rootDir, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      walkRepoFiles(rootDir, path.join(currentDir, entry.name), out)
      continue
    }

    const absolute = path.join(currentDir, entry.name)
    const relative = path.relative(rootDir, absolute)
    if (entry.isFile() && isTextLikeFile(absolute)) {
      out.push(relative)
    }
  }

  return out
}

function prioritizeRepoFiles(files: string[]): string[] {
  const score = (file: string): number => {
    const lower = file.toLowerCase()
    if (lower === 'readme.md' || lower.endsWith('/readme.md')) return 100
    if (lower.includes('/docs/')) return 80
    if (lower.includes('package.json') || lower.includes('pyproject.toml') || lower.includes('cargo.toml')) return 70
    if (lower.includes('/examples/') || lower.includes('/example/')) return 60
    if (lower.endsWith('.md') || lower.endsWith('.mdx')) return 50
    return 10
  }

  return [...files].sort((a, b) => score(b) - score(a) || a.localeCompare(b))
}

function readGitRepository(repoUrl: string): { title: string; content: string; source: string } {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omykb-repo-'))
  try {
    execFileSync('git', ['clone', '--depth=1', repoUrl, tempDir], { stdio: 'ignore' })
    const files = prioritizeRepoFiles(walkRepoFiles(tempDir)).slice(0, 40)
    const sections: string[] = []

    for (const relative of files) {
      const absolute = path.join(tempDir, relative)
      const stat = fs.statSync(absolute)
      if (stat.size > 64 * 1024) continue
      const content = fs.readFileSync(absolute, 'utf-8').trim()
      if (!content) continue
      sections.push(`## ${relative}\n\n\`\`\`\n${content.slice(0, 5000)}\n\`\`\``)
      if (sections.join('\n\n').length > 45000) break
    }

    const repoName = repoUrl.split('/').filter(Boolean).pop()?.replace(/\.git$/, '') || 'repository'
    return {
      title: repoName,
      content: sections.join('\n\n'),
      source: repoUrl,
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

function parserToolNameForType(type: string, source?: string): string {
  switch (type) {
    case 'pdf':
      return 'read_pdf'
    case 'docx':
      return 'read_docx'
    case 'pptx':
      return 'read_pptx'
    case 'spreadsheet':
      return 'read_spreadsheet'
    case 'notebook':
      return 'read_notebook'
    case 'image':
      return 'describe_image'
    case 'audio':
      return 'transcribe_audio'
    case 'video':
      return 'transcribe_video'
    case 'web':
      return 'crawl_site'
    case 'url':
      return 'fetch_url'
    case 'git':
      return 'read_git_repository'
    case 'text':
      return source === 'inline-text' ? 'inline_text' : 'extract_text_file'
    case 'json':
    case 'html':
    case 'xml':
    case 'markdown':
    case 'code':
    case 'file':
      return 'extract_text_file'
    default:
      return 'read_local_file'
  }
}

function buildFallbackToolTrace(payload: IngestSourcePayload, extracted: ExtractedSource): ToolTraceEntry[] {
  const trace: ToolTraceEntry[] = []

  if (payload.type === 'text') {
    trace.push({ name: 'inline_text', input: { title: payload.title || 'Text Note', preview: payload.content.slice(0, 120) } })
  } else if (payload.type === 'url') {
    const ext = extensionFromSource(payload.content)
    if (AUDIO_EXTENSIONS.has(ext)) {
      trace.push({ name: 'transcribe_audio', input: { file_path: payload.content } })
    } else if (VIDEO_EXTENSIONS.has(ext)) {
      trace.push({ name: 'transcribe_video', input: { file_path: payload.content } })
    } else if (payload.options?.crawl) {
      trace.push({
        name: 'crawl_site',
        input: {
          url: payload.content,
          max_pages: payload.options.maxPages || 10,
          max_depth: payload.options.maxDepth || 1,
        },
      })
    } else {
      trace.push({ name: 'fetch_url', input: { url: payload.content } })
    }
  } else if (payload.type === 'git') {
    trace.push({ name: 'read_git_repository', input: { repo_url: payload.content } })
  } else if (payload.type === 'file') {
    trace.push({ name: parserToolNameForType(extracted.type, extracted.source), input: { file_path: payload.content } })
  }

  trace.push({
    name: 'fallback_curation',
    input: {
      title: extracted.title,
      source_type: extracted.type,
      source: extracted.source,
    },
  })
  trace.push({
    name: 'write_document',
    input: {
      title: extracted.title,
      source: extracted.source,
      type: extracted.type,
    },
  })
  return trace
}

async function generateCuratedMarkdown(
  cfg: KBConfig,
  params: { title: string; sourceType: string; source: string; rawContent: string }
): Promise<{ title: string; summary: string; tags: string[]; markdown: string }> {
  const prompt = [
    'Turn the raw source into a clean knowledge-base Markdown note.',
    'Output JSON only with keys: title, summary, tags, markdown.',
    'Requirements for markdown:',
    '- Start with a short summary section.',
    '- Include key points.',
    '- Preserve important technical details, commands, code, tables, and URLs when relevant.',
    '- Add a "Source Notes" section describing origin and extraction limits.',
    '- Write in the same language as the source when obvious; otherwise use concise English.',
    '',
    `Source type: ${params.sourceType}`,
    `Source: ${params.source}`,
    `Preferred title: ${params.title}`,
    '',
    'Raw source content:',
    params.rawContent.slice(0, 45000),
  ].join('\n')

  if (!cfg.apiKey) {
    const fallback = buildFallbackMarkdown(params.title, params.rawContent, params.sourceType, params.source)
    return {
      title: resolveFallbackTitle(params.title, params.rawContent, params.sourceType),
      summary: fallback.summary,
      tags: fallback.tags,
      markdown: fallback.markdown,
    }
  }

  if (cfg.provider === 'openai') {
    const client = new OpenAI({
      apiKey: cfg.apiKey,
      ...(cfg.baseURL ? { baseURL: cfg.baseURL } : {}),
    })
    const response = await client.chat.completions.create({
      model: getCurationModel(cfg),
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You curate raw source material into structured Markdown knowledge notes.' },
        { role: 'user', content: prompt },
      ],
    })
    const parsed = parseJsonObject<{ title?: string; summary?: string; tags?: string[]; markdown?: string }>(
      response.choices[0]?.message?.content || '{}'
    )
    if (parsed?.markdown) {
      return {
        title: parsed.title || params.title,
        summary: parsed.summary || '',
        tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 8) : [],
        markdown: parsed.markdown,
      }
    }
  } else {
    const client = new Anthropic({ apiKey: cfg.apiKey })
    const response = await client.messages.create({
      model: getCurationModel(cfg),
      max_tokens: 3000,
      system: 'You curate raw source material into structured Markdown knowledge notes. Return JSON only.',
      messages: [{ role: 'user', content: prompt }],
    })
    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')
    const parsed = parseJsonObject<{ title?: string; summary?: string; tags?: string[]; markdown?: string }>(text)
    if (parsed?.markdown) {
      return {
        title: parsed.title || params.title,
        summary: parsed.summary || '',
        tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 8) : [],
        markdown: parsed.markdown,
      }
    }
  }

  const fallback = buildFallbackMarkdown(params.title, params.rawContent, params.sourceType, params.source)
  return {
    title: inferTitleFromContent(params.title, params.rawContent),
    summary: fallback.summary,
    tags: fallback.tags,
    markdown: fallback.markdown,
  }
}

function saveMarkdownDocument(
  storagePath: string,
  payload: {
    title: string
    markdown: string
    source: string
    type: string
    tags?: string[]
    summary?: string
  }
): IngestResult {
  ensureKBDirs(storagePath)

  const now = new Date().toISOString()
  const id = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const safeTitle = safeFileTitle(payload.title)
  const filename = `${slugify(safeTitle)}-${id.slice(-5)}.md`
  const docPath = path.join(storagePath, 'knowledge', filename)
  const frontmatter = [
    '---',
    `id: ${id}`,
    `title: ${JSON.stringify(safeTitle)}`,
    `source: ${JSON.stringify(payload.source)}`,
    `type: ${JSON.stringify(payload.type)}`,
    `addedAt: ${JSON.stringify(now)}`,
    `tags: ${JSON.stringify(payload.tags || [])}`,
    `summary: ${JSON.stringify(payload.summary || '')}`,
    '---',
    '',
  ].join('\n')
  const fullContent = `${frontmatter}${payload.markdown.trim()}\n`
  fs.writeFileSync(docPath, fullContent)

  const indexPath = path.join(storagePath, '.omykb', 'index.json')
  const index = fs.existsSync(indexPath)
    ? JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
    : { version: 1, documents: [] }
  index.version = index.version || 1
  index.documents = index.documents || []

  const meta = {
    id,
    title: safeTitle,
    source: payload.source,
    type: payload.type,
    path: docPath,
    addedAt: now,
    size: fullContent.length,
    wordCount: countWords(payload.markdown),
    chunkCount: estimateChunks(payload.markdown),
    tags: payload.tags || [],
    summary: payload.summary || '',
  }
  index.documents.push(meta)
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2))

  return {
    id,
    title: safeTitle,
    path: docPath,
    source: payload.source,
    type: payload.type,
    wordCount: meta.wordCount,
    chunkCount: meta.chunkCount,
    summary: payload.summary,
  }
}

async function extractSourceForIngestion(payload: IngestSourcePayload, cfg?: KBConfig): Promise<ExtractedSource> {
  if (payload.type === 'text') {
    return {
      title: payload.title || 'Text Note',
      rawContent: payload.content.trim(),
      source: 'inline-text',
      type: 'text',
    }
  }

  if (payload.type === 'file') {
    const file = await readLocalFileContent(payload.content, cfg)
    return {
      title: payload.title || file.title,
      rawContent: file.content,
      source: file.source,
      type: file.type || 'file',
    }
  }

  if (payload.type === 'git') {
    const repo = readGitRepository(payload.content)
    return {
      title: payload.title || repo.title,
      rawContent: repo.content,
      source: repo.source,
      type: 'git',
    }
  }

  const sourceExt = extensionFromSource(payload.content)
  if (AUDIO_EXTENSIONS.has(sourceExt)) {
    const audio = await transcribeAudioFile(payload.content, cfg)
    return {
      title: payload.title || audio.title,
      rawContent: audio.rawContent,
      source: audio.source,
      type: audio.type,
    }
  }
  if (VIDEO_EXTENSIONS.has(sourceExt)) {
    const video = await transcribeVideoFile(payload.content, cfg)
    return {
      title: payload.title || video.title,
      rawContent: video.rawContent,
      source: video.source,
      type: video.type,
    }
  }

  if (payload.options?.crawl) {
    const crawl = await crawlSite(payload.content, payload.options.maxPages || 10, payload.options.maxDepth || 1)
    return {
      title: payload.title || crawl.title,
      rawContent: crawl.rawContent,
      source: crawl.source,
      type: crawl.type,
    }
  }

  const page = parseJsonObject<ToolExtractedResult>(await fetchUrl(payload.content))
  if (!page?.rawContent) throw new Error(`Failed to fetch URL: ${payload.content}`)
  return {
    title: payload.title || page.title,
    rawContent: page.rawContent,
    source: page.source,
    type: page.type,
  }
}

// ─── Ingestion agent (headless, skill-driven) ─────────────────────────────────

function buildIngestionUserMessage(payload: IngestSourcePayload): string {
  const lines = [`Ingest this source into the knowledge base.`]
  lines.push(`Source type: ${payload.type}`)
  if (payload.type === 'file') {
    lines.push(`File path: ${payload.content}`)
  } else if (payload.type === 'url') {
    lines.push(`URL: ${payload.content}`)
    if (payload.options?.crawl) lines.push(`Crawl: yes (max ${payload.options.maxPages || 10} pages, depth ${payload.options.maxDepth || 1})`)
  } else if (payload.type === 'git') {
    lines.push(`Repository: ${payload.content}`)
  } else {
    lines.push(`Text content:\n${payload.content.slice(0, 2000)}`)
  }
  lines.push(`\nExtract, curate, and save to the knowledge base using write_document.`)
  return lines.join('\n')
}

async function runIngestionLoop(
  systemPrompt: string,
  userMessage: string,
  cfg: KBConfig,
  storagePath: string,
  onProgress?: (msg: string) => void
): Promise<IngestResult | null> {
  let capturedResult: IngestResult | null = null
  const toolTrace: ToolTraceEntry[] = []

  // Wrap write_document to capture ingestion result
  const wrappedExecute = async (name: string, input: Record<string, unknown>, sp: string, c?: KBConfig): Promise<string> => {
    toolTrace.push({ name, input })
    const result = await executeTool(name, input, sp, c)
    if (name === 'write_document') {
      try {
        const parsed = JSON.parse(result) as Partial<IngestResult>
        if (parsed.id) {
          capturedResult = {
            ...(parsed as IngestResult),
            ingestionMode: 'skill',
            toolTrace: [...toolTrace],
          }
        }
      } catch {}
    }
    return result
  }

  if (cfg.provider === 'openai') {
    const client = new OpenAI({ apiKey: cfg.apiKey, ...(cfg.baseURL ? { baseURL: cfg.baseURL } : {}) })
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ]
    for (let turn = 0; turn < 12; turn++) {
      const response = await client.chat.completions.create({
        model: getIngestionModel(cfg),
        messages,
        tools: OPENAI_TOOLS,
        tool_choice: 'auto',
      })
      const msg = response.choices[0]?.message
      if (!msg) break
      messages.push(msg as OpenAI.Chat.ChatCompletionMessageParam)

      if (!msg.tool_calls?.length) break

      const toolResults: OpenAI.Chat.ChatCompletionToolMessageParam[] = []
      for (const tc of msg.tool_calls) {
        let input: Record<string, unknown> = {}
        try { input = JSON.parse(tc.function.arguments || '{}') } catch {}
        onProgress?.(`⚙️ ${tc.function.name}`)
        const result = await wrappedExecute(tc.function.name, input, storagePath, cfg)
        toolResults.push({ role: 'tool', tool_call_id: tc.id, content: result })
        if (tc.function.name === 'write_document' && capturedResult) break
      }
      messages.push(...toolResults)
      if (capturedResult) break
    }
  } else {
    const client = new Anthropic({ apiKey: cfg.apiKey })
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }]
    for (let turn = 0; turn < 12; turn++) {
      const response = await client.messages.create({
        model: getIngestionModel(cfg),
        max_tokens: 4096,
        system: systemPrompt,
        tools: ANTHROPIC_TOOLS,
        messages,
      })
      messages.push({ role: 'assistant', content: response.content })

      if (response.stop_reason !== 'tool_use') break

      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const tool of toolUses) {
        onProgress?.(`⚙️ ${tool.name}`)
        const result = await wrappedExecute(tool.name, tool.input as Record<string, unknown>, storagePath, cfg)
        toolResults.push({ type: 'tool_result', tool_use_id: tool.id, content: result })
        if (tool.name === 'write_document' && capturedResult) break
      }
      messages.push({ role: 'user', content: toolResults })
      if (capturedResult) break
    }
  }

  return capturedResult
}

export async function ingestSourceToKB(
  payload: IngestSourcePayload & { skillContent?: string },
  cfg: KBConfig
): Promise<IngestResult> {
  // If we have a skill and an API key, use the skill-driven agent loop
  if (payload.skillContent && cfg.apiKey) {
    const result = await runIngestionLoop(
      payload.skillContent,
      buildIngestionUserMessage(payload),
      cfg,
      cfg.storagePath,
      (msg) => console.log('[ingest]', msg)
    )
    if (result) return result
    // Fall through to legacy pipeline if agent didn't produce a result
  }

  // Legacy fallback pipeline
  const extracted = await extractSourceForIngestion(payload, cfg)
  const curated = await generateCuratedMarkdown(cfg, {
    title: extracted.title,
    sourceType: extracted.type,
    source: extracted.source,
    rawContent: extracted.rawContent,
  })
  const saved = saveMarkdownDocument(cfg.storagePath, {
    title: curated.title || extracted.title,
    markdown: curated.markdown,
    source: extracted.source,
    type: extracted.type,
    tags: curated.tags,
    summary: curated.summary,
  })
  return {
    ...saved,
    ingestionMode: 'fallback',
    toolTrace: buildFallbackToolTrace(payload, extracted),
  }
}

function listDocuments(storagePath: string, filter?: string): string {
  const index = getIndex(storagePath)
  let docs = index.documents || []
  if (filter) {
    const q = filter.toLowerCase()
    docs = docs.filter((d: { title?: string; tags?: string[] }) =>
      (d.title || '').toLowerCase().includes(q) ||
      (d.tags || []).some((t: string) => t.toLowerCase().includes(q))
    )
  }
  return JSON.stringify({ documents: docs })
}

function readDocument(storagePath: string, id: string): string {
  const docPath = getDocumentPath(storagePath, id)
  if (!docPath || !fs.existsSync(docPath)) return JSON.stringify({ error: `Document ${id} not found` })
  return JSON.stringify({ content: fs.readFileSync(docPath, 'utf-8') })
}

function searchDocuments(storagePath: string, query: string, limit = 5): string {
  const index = getIndex(storagePath)
  if (!index.documents?.length) return JSON.stringify({ results: [] })
  const docs: Array<{ id: string; title: string; tags?: string[]; addedAt: string }> = index.documents || []
  const q = query.toLowerCase()
  const scored = docs.map(doc => {
    let score = 0
    if ((doc.title || '').toLowerCase().includes(q)) score += 10
    if ((doc.tags || []).some((t: string) => t.toLowerCase().includes(q))) score += 5
    const docPath = getDocumentPath(storagePath, doc.id)
    let snippet = ''
    if (docPath && fs.existsSync(docPath)) {
      const content = fs.readFileSync(docPath, 'utf-8')
      const idx = content.toLowerCase().indexOf(q)
      if (idx !== -1) { score += 3; snippet = content.slice(Math.max(0, idx - 80), idx + 160).trim() }
    }
    return { ...doc, score, snippet }
  })
  return JSON.stringify({
    results: scored.filter(d => d.score > 0).sort((a, b) => b.score - a.score).slice(0, limit),
  })
}

function writeDocument(storagePath: string, title: string, content: string, tags: string[] = [], id?: string): string {
  if (id) {
    const docPath = path.join(storagePath, 'knowledge', `${id}.md`)
    const saved = saveMarkdownDocument(storagePath, {
      title,
      markdown: content,
      source: 'agent-write',
      type: 'note',
      tags,
      summary: '',
    })
    return JSON.stringify({ ...saved, requestedId: id, status: 'saved-as-new' })
  }

  const saved = saveMarkdownDocument(storagePath, {
    title,
    markdown: content,
    source: 'agent-write',
    type: 'note',
    tags,
    summary: '',
  })
  return JSON.stringify({ ...saved, status: 'saved' })
}

function fetchUrl(url: string): Promise<string> {
  return fetchUrlRaw(url).then(result => JSON.stringify(buildExtractedResult(
    result.url,
    'url',
    result.title,
    result.text,
    {
      images: result.images,
      note: result.images.length > 0
        ? `Found ${result.images.length} image(s) on this page. Use download_image + describe_image on images that may contain diagrams, charts, or tables.`
        : undefined,
      local_path: undefined,
    }
  )))
}

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  storagePath: string,
  cfg?: KBConfig
): Promise<string> {
  switch (name) {
    case 'list_documents':   return listDocuments(storagePath, input.filter as string | undefined)
    case 'read_document':    return readDocument(storagePath, input.id as string)
    case 'search_documents': return searchDocuments(storagePath, input.query as string, input.limit as number | undefined)
    case 'write_document':   return writeDocument(storagePath, input.title as string, input.content as string, (input.tags as string[]) || [], input.id as string | undefined)
    case 'fetch_url':        return await fetchUrl(input.url as string)
    case 'crawl_site': {
      const result = await crawlSite(input.url as string, Number(input.max_pages) || 10, Number(input.max_depth) || 1)
      return JSON.stringify(result)
    }
    case 'read_local_file': {
      const result = await readLocalFileContent(input.file_path as string, cfg)
      return JSON.stringify(result)
    }
    case 'read_git_repository': {
      const result = readGitRepository(input.repo_url as string)
      return JSON.stringify(result)
    }
    case 'ingest_source': {
      if (!cfg) return JSON.stringify({ error: 'KB config unavailable' })
      const result = await ingestSourceToKB({
        type: input.source_type as IngestSourcePayload['type'],
        content: input.source as string,
        title: input.title as string | undefined,
        options: {
          crawl: Boolean(input.crawl),
          maxPages: Number(input.max_pages) || undefined,
          maxDepth: Number(input.max_depth) || undefined,
        },
      }, cfg)
      return JSON.stringify(result)
    }
    case 'read_pdf':          return await toolReadPdf(input.file_path as string)
    case 'read_docx':         return await toolReadDocx(input.file_path as string)
    case 'read_pptx':         return await toolReadPptx(input.file_path as string)
    case 'read_spreadsheet':  return toolReadSpreadsheet(input.file_path as string)
    case 'extract_text_file': return toolExtractTextFile(input.file_path as string)
    case 'read_notebook':     return toolReadNotebook(input.file_path as string)
    case 'pdf_to_image':      return toolPdfToImage(input.file_path as string)
    case 'describe_image':    return cfg ? await toolDescribeImage(input.file_path as string, input.hint as string | undefined, cfg) : JSON.stringify({ error: 'No config for vision model' })
    case 'transcribe_audio':  return await toolTranscribeAudio(input.file_path as string, cfg)
    case 'transcribe_video':  return await toolTranscribeVideo(input.file_path as string, cfg)
    case 'download_image':   return await toolDownloadImage(input.image_url as string, input.alt_text as string | undefined)
    default:                 return JSON.stringify({ error: `Unknown tool: ${name}` })
  }
}

function buildSystemPrompt(cfg: KBConfig): string {
  return cfg.systemPrompt ||
    `You are OMYKB, an AI-powered personal knowledge base assistant. You help users store, organize, search, and retrieve information from their knowledge base.

You have tools to list, read, search, write, fetch, crawl, and ingest documents in the user's knowledge base (stored at: ${cfg.storagePath}).

When answering questions:
1. Search relevant documents first using search_documents
2. Cite sources when referencing stored knowledge
3. Use descriptive titles and meaningful tags when saving documents
4. Be concise and helpful

When the user asks to add, sync, import, crawl, fetch, or save external knowledge:
1. Read or fetch the raw source with tools first
2. Prefer ingest_source to save curated Markdown into the KB
3. For websites, use crawl_site if the user asks for docs/site sync
4. For repositories, use read_git_repository or ingest_source with source_type=git
5. Confirm what was stored, including title and source
6. Prefer format-specific parser tools for local files:
   - read_pdf, read_docx, read_pptx, read_spreadsheet, read_notebook, extract_text_file, describe_image, transcribe_audio, transcribe_video
7. Treat read_local_file as a convenience router, not the preferred first choice when a specific parser fits

Today's date: ${new Date().toLocaleDateString()}`
}

// ─── Anthropic ReAct loop ─────────────────────────────────────────────────────

async function runAnthropicLoop(
  messages: Anthropic.MessageParam[],
  cfg: KBConfig,
  win: BrowserWindow
): Promise<void> {
  const client = new Anthropic({ apiKey: cfg.apiKey })
  const currentMessages = [...messages]

  while (true) {
    const stream = client.messages.stream({
      model: getChatModel(cfg),
      max_tokens: 8096,
      thinking: { type: 'adaptive' },
      system: buildSystemPrompt(cfg),
      tools: ANTHROPIC_TOOLS,
      messages: currentMessages,
    })

    let fullText = ''
    const toolUses: Anthropic.ToolUseBlock[] = []
    let currentToolUse: { id: string; name: string; inputRaw: string } | null = null

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          currentToolUse = { id: event.content_block.id, name: event.content_block.name, inputRaw: '' }
          win.webContents.send('stream:tool', { name: event.content_block.name, input: null })
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          win.webContents.send('stream:chunk', event.delta.text)
          fullText += event.delta.text
        } else if (event.delta.type === 'input_json_delta' && currentToolUse) {
          currentToolUse.inputRaw += event.delta.partial_json
        }
      } else if (event.type === 'content_block_stop' && currentToolUse) {
        const parsed = JSON.parse(currentToolUse.inputRaw || '{}')
        toolUses.push({ type: 'tool_use', id: currentToolUse.id, name: currentToolUse.name, input: parsed })
        win.webContents.send('stream:tool', { name: currentToolUse.name, input: parsed })
        currentToolUse = null
      }
    }

    const finalMsg = await stream.finalMessage()

    if (finalMsg.stop_reason !== 'tool_use') {
      win.webContents.send('stream:done', {
        inputTokens: finalMsg.usage.input_tokens,
        outputTokens: finalMsg.usage.output_tokens,
      })
      break
    }

    // Execute tools and continue loop
    currentMessages.push({ role: 'assistant', content: finalMsg.content })
    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const tool of toolUses) {
      const result = await executeTool(tool.name, tool.input as Record<string, unknown>, cfg.storagePath, cfg)
      toolResults.push({ type: 'tool_result', tool_use_id: tool.id, content: result })
    }
    currentMessages.push({ role: 'user', content: toolResults })
  }
}

// ─── OpenAI ReAct loop ────────────────────────────────────────────────────────

async function runOpenAILoop(
  messages: Array<{ role: string; content: string }>,
  cfg: KBConfig,
  win: BrowserWindow
): Promise<void> {
  const client = new OpenAI({
    apiKey: cfg.apiKey,
    ...(cfg.baseURL ? { baseURL: cfg.baseURL } : {}),
  })

  const currentMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: buildSystemPrompt(cfg) },
    ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ]

  while (true) {
    const stream = await client.chat.completions.create({
      model: getChatModel(cfg),
      messages: currentMessages,
      tools: OPENAI_TOOLS,
      tool_choice: 'auto',
      stream: true,
    })

    let fullText = ''
    // Accumulate tool calls across stream chunks
    const toolCallMap: Record<number, { id: string; name: string; argsRaw: string }> = {}
    let finishReason: string | null = null
    let promptTokens = 0
    let completionTokens = 0

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta
      if (!delta) continue

      if (delta.content) {
        win.webContents.send('stream:chunk', delta.content)
        fullText += delta.content
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index
          if (!toolCallMap[idx]) {
            toolCallMap[idx] = { id: tc.id || '', name: tc.function?.name || '', argsRaw: '' }
            if (tc.function?.name) {
              win.webContents.send('stream:tool', { name: tc.function.name, input: null })
            }
          }
          if (tc.id) toolCallMap[idx].id = tc.id
          if (tc.function?.name) toolCallMap[idx].name = tc.function.name
          if (tc.function?.arguments) toolCallMap[idx].argsRaw += tc.function.arguments
        }
      }

      if (chunk.choices[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason
      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens || 0
        completionTokens = chunk.usage.completion_tokens || 0
      }
    }

    const toolCalls = Object.values(toolCallMap)

    if (finishReason !== 'tool_calls' || toolCalls.length === 0) {
      win.webContents.send('stream:done', {
        inputTokens: promptTokens,
        outputTokens: completionTokens,
      })
      break
    }

    // Build assistant message with tool_calls
    const assistantMsg: OpenAI.Chat.ChatCompletionAssistantMessageParam = {
      role: 'assistant',
      content: fullText || null,
      tool_calls: toolCalls.map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: tc.argsRaw },
      })),
    }
    currentMessages.push(assistantMsg)

    // Execute tools
    for (const tc of toolCalls) {
      let input: Record<string, unknown> = {}
      try { input = JSON.parse(tc.argsRaw || '{}') } catch {}
      win.webContents.send('stream:tool', { name: tc.name, input })
      const result = await executeTool(tc.name, input, cfg.storagePath, cfg)
      currentMessages.push({
        role: 'tool' as const,
        tool_call_id: tc.id,
        content: result,
      })
    }
  }
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function runAgentStream(
  messages: Array<{ role: string; content: string }>,
  cfg: KBConfig,
  win: BrowserWindow
): Promise<void> {
  if (cfg.provider === 'openai') {
    await runOpenAILoop(messages, cfg, win)
  } else {
    await runAnthropicLoop(
      messages as Anthropic.MessageParam[],
      cfg,
      win
    )
  }
}
