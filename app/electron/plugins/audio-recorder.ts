import { ipcMain } from 'electron'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import WebSocket from 'ws'
import OSS from 'ali-oss'
import { KBConfig } from '../agent'

interface DashScopeSession {
  ws: WebSocket
  taskId: string
  pcmChunks: Int16Array[]
}

const dsSessions = new Map<number, DashScopeSession>()
const savedWavPaths = new Map<number, string>()

function writeWavFile(chunks: Int16Array[], sampleRate: number): string {
  const totalSamples = chunks.reduce((s, c) => s + c.length, 0)
  const pcm = new Int16Array(totalSamples)
  let offset = 0
  for (const c of chunks) { pcm.set(c, offset); offset += c.length }
  const pcmBuf = Buffer.from(pcm.buffer)
  const wavPath = path.join(os.tmpdir(), `omykb-diarize-${Date.now()}.wav`)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcmBuf.length, 4)
  header.write('WAVE', 8); header.write('fmt ', 12)
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22); header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34); header.write('data', 36)
  header.writeUInt32LE(pcmBuf.length, 40)
  fs.writeFileSync(wavPath, Buffer.concat([header, pcmBuf]))
  return wavPath
}

function dsBASE(cfg: KBConfig) {
  return (cfg.asrBaseURL || 'https://dashscope-intl.aliyuncs.com').replace(/\/$/, '')
}

// Recording file transcription — use same base as realtime ASR by default
function dsDiarizeBASE(cfg: KBConfig) {
  return (cfg.diarizeBaseURL || cfg.asrBaseURL || 'https://dashscope-intl.aliyuncs.com').replace(/\/$/, '')
}

function dsKEY(cfg: KBConfig) {
  return cfg.asrApiKey || cfg.apiKey
}

async function uploadWavToOSS(wavPath: string, cfg: KBConfig): Promise<string> {
  if (!cfg.ossRegion || !cfg.ossAccessKeyId || !cfg.ossAccessKeySecret || !cfg.ossBucket) {
    throw new Error(
      '说话人识别需要阿里云 OSS 存储录音文件。\n请在 Settings → OSS Storage 中配置 Region、AccessKeyId、AccessKeySecret、Bucket。'
    )
  }
  const client = new OSS({
    region: cfg.ossRegion,
    accessKeyId: cfg.ossAccessKeyId,
    accessKeySecret: cfg.ossAccessKeySecret,
    bucket: cfg.ossBucket,
  })
  const objectName = `omykb-recordings/${path.basename(wavPath)}`
  await client.put(objectName, wavPath)
  // Pre-signed URL valid for 1 hour
  const url = client.signatureUrl(objectName, { expires: 3600 })
  return url
}

async function submitDiarizeTask(fileUrl: string, apiKey: string, base: string, speakerCount?: number): Promise<string> {
  const res = await fetch(`${base}/api/v1/services/audio/asr/transcription`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify({
      model: 'fun-asr',
      input: { file_urls: [fileUrl] },
      parameters: {
        language_hints: ['zh', 'en'],
        diarization_enabled: true,
        ...(speakerCount && speakerCount > 1 ? { speaker_count: speakerCount } : {}),
      },
    }),
  })
  if (!res.ok) throw new Error(`Submit failed ${res.status}: ${await res.text()}`)
  const data = await res.json() as { output: { task_id: string } }
  return data.output.task_id
}

interface DiarizedSentence { text: string; begin_time: number; end_time: number; speaker_id: number }
interface PollResult { status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'; sentences?: DiarizedSentence[]; error?: string }

async function pollDiarizeTask(taskId: string, apiKey: string, base: string): Promise<PollResult> {
  const res = await fetch(`${base}/api/v1/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) return { status: 'FAILED', error: `Poll failed ${res.status}` }
  const data = await res.json() as {
    output: {
      task_status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'
      results?: Array<{ transcription_url: string }>
      message?: string
    }
  }
  const status = data.output.task_status
  if (status === 'SUCCEEDED' && data.output.results?.[0]?.transcription_url) {
    const r = await fetch(data.output.results[0].transcription_url)
    const result = await r.json() as { transcripts: Array<{ sentences: DiarizedSentence[] }> }
    const sentences = result.transcripts?.flatMap(t => t.sentences) ?? []
    return { status: 'SUCCEEDED', sentences }
  }
  if (status === 'FAILED') return { status: 'FAILED', error: data.output.message || 'Task failed' }
  return { status }
}

const LANG_NAMES: Record<string, string> = {
  zh: 'Chinese (Simplified)',
  en: 'English',
  ja: 'Japanese',
  ko: 'Korean',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  ru: 'Russian',
  ar: 'Arabic',
  pt: 'Portuguese',
}

function getAsrProvider(cfg: KBConfig) {
  return cfg.asrProvider || 'openai'
}

function getAsrApiKey(cfg: KBConfig) {
  return cfg.asrApiKey || (getAsrProvider(cfg) === 'openai' ? cfg.apiKey : '')
}

function getAsrModel(cfg: KBConfig) {
  const defaults: Record<string, string> = { openai: 'whisper-1', aliyun: 'paraformer-v2' }
  return cfg.asrModel || defaults[getAsrProvider(cfg)]
}

async function callLLM(prompt: string, cfg: KBConfig): Promise<string> {
  const model = cfg.chatModel || cfg.model
  if (cfg.provider === 'anthropic') {
    const client = new Anthropic({
      apiKey: cfg.apiKey,
      ...(cfg.baseURL ? { baseURL: cfg.baseURL } : {}),
    })
    const msg = await client.messages.create({
      model,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })
    return (msg.content[0] as { text: string }).text
  } else {
    const client = new OpenAI({
      apiKey: cfg.apiKey,
      ...(cfg.baseURL ? { baseURL: cfg.baseURL } : {}),
    })
    const completion = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
    })
    return completion.choices[0]?.message?.content || ''
  }
}

export function registerAudioRecorderHandlers(loadConfig: () => KBConfig) {
  // Transcribe an audio chunk (webm bytes from MediaRecorder)
  ipcMain.handle('recorder:transcribe-chunk', async (_event, bytes: number[], ext: string) => {
    const cfg = loadConfig()
    const provider = getAsrProvider(cfg)

    if (provider === 'aliyun') {
      return { error: 'Aliyun ASR requires HTTP file URLs and cannot transcribe live recordings. Switch ASR provider to OpenAI in Settings.' }
    }

    const asrApiKey = getAsrApiKey(cfg)
    if (!asrApiKey) {
      return { error: 'No ASR API key configured. Add one in Settings → LLM & API.' }
    }

    const tmpFile = path.join(os.tmpdir(), `omykb-rec-${Date.now()}.${ext}`)
    try {
      fs.writeFileSync(tmpFile, Buffer.from(bytes))

      const client = new OpenAI({
        apiKey: asrApiKey,
        ...(cfg.asrBaseURL ? { baseURL: cfg.asrBaseURL } : {}),
      })

      const response = await client.audio.transcriptions.create({
        file: fs.createReadStream(tmpFile),
        model: getAsrModel(cfg),
      })

      return { text: (response.text || '').trim() }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { error: message }
    } finally {
      try { fs.unlinkSync(tmpFile) } catch { /* ignore */ }
    }
  })

  // Translate text to target language using the configured LLM
  ipcMain.handle('recorder:translate', async (_event, text: string, targetLangCode: string) => {
    const cfg = loadConfig()
    const langName = LANG_NAMES[targetLangCode] || targetLangCode

    try {
      const result = await callLLM(
        `Translate the following text to ${langName}. Return only the translation, no explanation or preamble:\n\n${text}`,
        cfg,
      )
      return { text: result.trim() }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { error: message }
    }
  })

  // Summarize a list of transcript segments into bullet points
  ipcMain.handle('recorder:summarize', async (_event, segments: string[]) => {
    const cfg = loadConfig()
    const transcript = segments.join('\n')

    try {
      const result = await callLLM(
        `You are a meeting notes assistant. Summarize the following transcript excerpt into 3–5 concise bullet points. ` +
        `Write in the same language as the transcript. Focus on key decisions, action items, and important topics:\n\n${transcript}`,
        cfg,
      )
      return { text: result.trim() }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { error: message }
    }
  })

  // ── FunASR Local real-time streaming ─────────────────────────────────────────
  // Connects to a self-hosted FunASR runtime server (ws://host:port).
  // Uses the 2pass protocol: binary PCM frames → offline result with spk_label.

  function startFunASRLocalSession(
    senderId: number,
    sender: Electron.WebContents,
    wsUrl: string,
    mode: string,
  ): Promise<{ error?: string }> {
    // Close any existing session
    const existing = dsSessions.get(senderId)
    if (existing) { try { existing.ws.close() } catch { /* ignore */ } dsSessions.delete(senderId) }

    const taskId = `funasr-${Date.now()}`
    // Sentence counter: increments each time a 2pass-offline result is received,
    // so online partials and the corresponding offline final share the same sentenceId.
    let sentenceCounter = 0

    return new Promise(resolve => {
      const ws = new WebSocket(wsUrl)

      ws.once('open', () => {
        ws.send(JSON.stringify({
          mode,
          chunk_size: [5, 10, 5],
          chunk_interval: 10,
          encoder_chunk_look_back: 4,
          decoder_chunk_look_back: 0,
          wav_name: taskId,
          is_speaking: true,
          wav_format: 'pcm',
          itn: true,
          hotwords: '',
        }))
        dsSessions.set(senderId, { ws, taskId, pcmChunks: [] })
        resolve({})
      })

      ws.on('message', raw => {
        try {
          const msg = JSON.parse(raw.toString()) as {
            mode?: string
            text?: string
            wav_name?: string
            spk_label?: string
            is_final?: boolean
            timestamp?: string
          }
          if (!sender.isDestroyed()) {
            if (msg.mode === '2pass-online' || msg.mode === 'online') {
              // Partial result — same sentenceId as the upcoming offline result
              sender.send('recorder:ds:result', {
                text: msg.text ?? '',
                isFinal: false,
                sentenceId: sentenceCounter,
                spkLabel: undefined,
              })
            } else if (msg.mode === '2pass-offline' || msg.mode === 'offline') {
              // Final result — may include spk_label (if server started with speaker model)
              sender.send('recorder:ds:result', {
                text: msg.text ?? '',
                isFinal: true,
                sentenceId: sentenceCounter,
                spkLabel: msg.spk_label,
              })
              sentenceCounter++
            }
          }
        } catch { /* ignore parse errors */ }
      })

      ws.on('close', () => {
        if (!sender.isDestroyed()) sender.send('recorder:ds:done')
        dsSessions.delete(senderId)
      })

      ws.once('error', err => { resolve({ error: `FunASR connection failed: ${err.message}` }) })
    })
  }

  // ── DashScope real-time streaming ──────────────────────────────────────────

  ipcMain.handle('recorder:ds:start', async (event, model: string) => {
    const cfg = loadConfig()
    const senderId = event.sender.id
    const sender = event.sender

    // ── FunASR Local path ──
    if (cfg.asrProvider === 'funasr-local') {
      const wsUrl = (cfg.asrBaseURL || 'ws://localhost:10096').replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')
      const mode = model || '2pass'
      return startFunASRLocalSession(senderId, sender, wsUrl, mode)
    }

    // ── DashScope path ──
    const apiKey = cfg.asrApiKey || cfg.apiKey
    if (!apiKey) return { error: 'No API key configured. Add one in Settings → LLM & API.' }

    // Close any existing session
    const existing = dsSessions.get(senderId)
    if (existing) { try { existing.ws.close() } catch { /* ignore */ } dsSessions.delete(senderId) }

    const taskId = crypto.randomUUID()
    const baseURL = (cfg.asrBaseURL || 'https://dashscope-intl.aliyuncs.com').replace(/\/$/, '')
    const wsURL = baseURL.replace(/^http/, 'ws') + '/api-ws/v1/inference'

    return new Promise<{ error?: string }>(resolve => {
      const ws = new WebSocket(wsURL, { headers: { Authorization: `bearer ${apiKey}` } })

      ws.once('open', () => {
        ws.send(JSON.stringify({
          header: { action: 'run-task', task_id: taskId, streaming: 'duplex' },
          payload: {
            task_group: 'audio', task: 'asr', function: 'recognition', model,
            input: {},
            parameters: { format: 'pcm', sample_rate: 16000 },
          },
        }))
      })

      ws.on('message', raw => {
        try {
          const msg = JSON.parse(raw.toString())
          const ev = msg.header?.event

          if (ev === 'task-started') {
            dsSessions.set(senderId, { ws, taskId, pcmChunks: [] })
            resolve({})
          } else if (ev === 'result-generated') {
            const sentence = msg.payload?.output?.sentence
            if (sentence && !sender.isDestroyed()) {
              sender.send('recorder:ds:result', {
                text: sentence.text ?? '',
                isFinal: sentence.sentence_end === true,
                sentenceId: sentence.sentence_id ?? 0,
              })
            }
          } else if (ev === 'task-finished') {
            if (!sender.isDestroyed()) sender.send('recorder:ds:done')
            dsSessions.delete(senderId)
            ws.close()
          } else if (ev === 'task-failed') {
            const errMsg = JSON.stringify(msg.payload?.output ?? msg.header)
            if (!sender.isDestroyed()) sender.send('recorder:ds:error', errMsg)
            dsSessions.delete(senderId)
          }
        } catch { /* ignore parse errors */ }
      })

      ws.once('error', err => { resolve({ error: err.message }) })
      ws.once('close', () => { dsSessions.delete(senderId) })
    })
  })

  ipcMain.on('recorder:ds:audio', (event, samples: number[]) => {
    const session = dsSessions.get(event.sender.id)
    if (!session || session.ws.readyState !== WebSocket.OPEN) return
    const i16 = new Int16Array(samples)
    session.pcmChunks.push(i16)
    session.ws.send(Buffer.from(i16.buffer))
  })

  ipcMain.handle('recorder:ds:stop', async event => {
    const session = dsSessions.get(event.sender.id)
    if (!session) return {}

    const cfg = loadConfig()

    if (session.ws.readyState === WebSocket.OPEN) {
      if (cfg.asrProvider === 'funasr-local') {
        // FunASR end-of-speech signal — server will flush remaining audio and close
        session.ws.send(JSON.stringify({ is_speaking: false }))
      } else {
        // DashScope finish-task
        session.ws.send(JSON.stringify({
          header: { action: 'finish-task', task_id: session.taskId, streaming: 'duplex' },
          payload: { input: {} },
        }))
      }
    }

    // Save accumulated PCM as WAV (used for DashScope OSS diarization; kept for debug with funasr-local)
    if (session.pcmChunks.length > 0) {
      try {
        const prev = savedWavPaths.get(event.sender.id)
        if (prev) { try { fs.unlinkSync(prev) } catch { /* ignore */ } }
        const wavPath = writeWavFile(session.pcmChunks, 16000)
        savedWavPaths.set(event.sender.id, wavPath)
      } catch { /* ignore WAV write errors */ }
    }
    return {}
  })

  ipcMain.handle('recorder:diarize:start', async (event, speakerCount?: number) => {
    const cfg = loadConfig()

    // FunASR local: diarization is built into the 2pass-offline results — no extra step needed
    if (cfg.asrProvider === 'funasr-local') {
      return { error: 'FunASR local speaker labels are embedded in real-time results. No separate diarization step required.' }
    }

    const wavPath = savedWavPaths.get(event.sender.id)
    if (!wavPath || !fs.existsSync(wavPath)) {
      return { error: 'No recorded audio found. Use DashScope real-time mode to record first.' }
    }
    const apiKey = dsKEY(cfg)
    if (!apiKey) return { error: 'No API key configured' }
    const diarizeBase = dsDiarizeBASE(cfg)
    try {
      const fileUrl = await uploadWavToOSS(wavPath, cfg)
      const taskId = await submitDiarizeTask(fileUrl, apiKey, diarizeBase, speakerCount)
      return { taskId }
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('recorder:diarize:poll', async (event, taskId: string) => {
    const cfg = loadConfig()
    const apiKey = dsKEY(cfg)
    if (!apiKey) return { status: 'FAILED', error: 'No API key' }
    const base = dsDiarizeBASE(cfg)
    try {
      return await pollDiarizeTask(taskId, apiKey, base)
    } catch (err: unknown) {
      return { status: 'FAILED', error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('recorder:generate-notes', async (_event, segments: Array<{ speaker: string; time: number; text: string }>) => {
    const cfg = loadConfig()
    const lines = segments.map(s => `[${Math.floor(s.time / 60).toString().padStart(2, '0')}:${(s.time % 60).toString().padStart(2, '0')}] ${s.speaker}: ${s.text}`)
    const transcript = lines.join('\n')
    try {
      const result = await callLLM(
        `你是一位专业会议纪要助手。根据以下带发言人标签的会议记录，生成：\n\n` +
        `## 会议摘要\n（2-3句话概括）\n\n## 主要议题与决策\n（5-8条要点）\n\n## 行动项\n（按发言人列出待办事项）\n\n` +
        `请用与对话相同的语言撰写。\n\n会议记录：\n${transcript}`,
        cfg,
      )
      return { text: result.trim() }
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })
}
