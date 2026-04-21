import { ipcMain } from 'electron'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { KBConfig } from '../agent'

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
}
