/**
 * OpenAI-compatible client wrapper for xAI/Grok and other providers.
 *
 * Provides a unified interface that matches how the codebase uses
 * the Anthropic SDK (client.messages.create), so call sites only
 * need minimal changes.
 */
import OpenAI from 'openai'
import prisma from '@/lib/db'

// ── Types matching Anthropic SDK shape ──────────────────────────────────────

export interface TextBlock {
  type: 'text'
  text: string
}

export interface MessageResponse {
  content: TextBlock[]
}

export interface ImageSource {
  type: 'base64'
  media_type: string
  data: string
}

export interface ImageContentBlock {
  type: 'image'
  source: ImageSource
}

export interface TextContentBlock {
  type: 'text'
  text: string
}

export type ContentBlock = ImageContentBlock | TextContentBlock

export interface Message {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

export interface CreateParams {
  model: string
  max_tokens: number
  messages: Message[]
}

/**
 * Thin wrapper around the OpenAI SDK that exposes a `.messages.create()`
 * method matching the Anthropic SDK shape used throughout the codebase.
 *
 * Supports vision (base64 images) via OpenAI's image_url with data URIs.
 */
export class OpenAICompatClient {
  private client: OpenAI
  public provider: 'openai' | 'xai'

  constructor(options: { apiKey: string; baseURL?: string; provider?: 'openai' | 'xai' }) {
    this.provider = options.provider ?? 'openai'
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
    })
  }

  messages = {
    create: async (params: CreateParams): Promise<MessageResponse> => {
      const openaiMessages: OpenAI.ChatCompletionMessageParam[] = params.messages.map((msg) => {
        if (typeof msg.content === 'string') {
          if (msg.role === 'assistant') {
            return { role: 'assistant' as const, content: msg.content }
          }
          return { role: 'user' as const, content: msg.content }
        }

        // Convert Anthropic-style content blocks to OpenAI format
        const parts: OpenAI.ChatCompletionContentPart[] = msg.content.map((block) => {
          if (block.type === 'text') {
            return { type: 'text' as const, text: block.text }
          }
          if (block.type === 'image') {
            // OpenAI uses data URIs for base64 images
            const dataUri = `data:${block.source.media_type};base64,${block.source.data}`
            return {
              type: 'image_url' as const,
              image_url: { url: dataUri },
            }
          }
          return { type: 'text' as const, text: '' }
        })

        // Content array is only valid for user messages in OpenAI SDK
        return { role: 'user' as const, content: parts }
      })

      const response = await this.client.chat.completions.create({
        model: params.model,
        max_tokens: params.max_tokens,
        messages: openaiMessages,
      })

      const text = response.choices?.[0]?.message?.content ?? ''
      return {
        content: [{ type: 'text', text }],
      }
    },
  }
}

// ── Model mapping ───────────────────────────────────────────────────────────

/** Map stored model setting → actual xAI model name */
export function resolveXAIModel(settingValue: string): string {
  const map: Record<string, string> = {
    'grok-3': 'grok-3',
    'grok-3-mini': 'grok-3-mini',
    'grok-2-vision': 'grok-2-vision-1212',
    'grok-2': 'grok-2-1212',
  }
  return map[settingValue] ?? settingValue
}

/** Map stored model setting → actual OpenAI model name */
export function resolveOpenAIModel(settingValue: string): string {
  return settingValue // OpenAI model names are used as-is
}

// ── Client resolution ───────────────────────────────────────────────────────

/**
 * Resolves an OpenAI-compatible client by checking:
 * 1. xAI/Grok key (stored as 'openaiApiKey' in DB — starts with xai-)
 * 2. Regular OpenAI key
 *
 * Returns null if no key is configured.
 */
export async function resolveOpenAICompatClient(): Promise<OpenAICompatClient | null> {
  const setting = await prisma.setting.findUnique({ where: { key: 'openaiApiKey' } })
  const key = setting?.value?.trim()
  if (!key) return null

  if (key.startsWith('xai-')) {
    return new OpenAICompatClient({
      apiKey: key,
      baseURL: 'https://api.x.ai/v1',
      provider: 'xai',
    })
  }

  // Regular OpenAI key
  return new OpenAICompatClient({
    apiKey: key,
    provider: 'openai',
  })
}

/**
 * Get the stored OpenAI/xAI model setting, with smart defaults.
 */
let _cachedOpenAIModel: string | null = null
let _openAIModelExpiry = 0

export async function getOpenAIModel(): Promise<string> {
  if (_cachedOpenAIModel && Date.now() < _openAIModelExpiry) return _cachedOpenAIModel
  const setting = await prisma.setting.findUnique({ where: { key: 'openaiModel' } })
  _cachedOpenAIModel = setting?.value ?? 'grok-3-mini'
  _openAIModelExpiry = Date.now() + 5 * 60 * 1000
  return _cachedOpenAIModel
}

/**
 * Detect which provider is active: checks anthropic first, then openai/xai.
 * Returns the provider name or null if nothing is configured.
 */
export async function getActiveProvider(): Promise<'anthropic' | 'xai' | 'openai' | null> {
  // Check Anthropic key first
  const anthropicKey = await prisma.setting.findUnique({ where: { key: 'anthropicApiKey' } })
  if (anthropicKey?.value?.trim()) return 'anthropic'

  // Check OpenAI/xAI key
  const openaiKey = await prisma.setting.findUnique({ where: { key: 'openaiApiKey' } })
  const key = openaiKey?.value?.trim()
  if (!key) return null

  return key.startsWith('xai-') ? 'xai' : 'openai'
}
