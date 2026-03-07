import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { resolveAnthropicClient, getCliAuthStatus, resolveAnyClient } from '@/lib/claude-cli-auth'
import { OpenAICompatClient } from '@/lib/openai-client'

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { provider?: string } = {}
  try {
    const text = await request.text()
    if (text.trim()) body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const provider = body.provider ?? 'anthropic'

  if (provider === 'anthropic') {
    const setting = await prisma.setting.findUnique({ where: { key: 'anthropicApiKey' } })
    const dbKey = setting?.value?.trim()

    let client
    try {
      client = resolveAnthropicClient({ dbKey })
    } catch {
      // Check if CLI auth is available but expired
      const cliStatus = getCliAuthStatus()
      if (cliStatus.available && cliStatus.expired) {
        return NextResponse.json({ working: false, error: 'Claude CLI session expired — run `claude` to refresh' })
      }
      return NextResponse.json({ working: false, error: 'No API key found. Add one in Settings or log in with Claude CLI.' })
    }

    try {
      await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 5,
        messages: [{ role: 'user', content: 'hi' }],
      })
      return NextResponse.json({ working: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const friendly = msg.includes('401') || msg.includes('invalid_api_key')
        ? 'Invalid API key'
        : msg.includes('403')
        ? 'Key does not have permission'
        : msg.slice(0, 120)
      return NextResponse.json({ working: false, error: friendly })
    }
  }

  if (provider === 'openai') {
    const setting = await prisma.setting.findUnique({ where: { key: 'openaiApiKey' } })
    const key = setting?.value?.trim()
    if (!key) {
      return NextResponse.json({ working: false, error: 'No OpenAI/xAI key found. Add one in Settings.' })
    }

    try {
      const isXai = key.startsWith('xai-')
      const testClient = new OpenAICompatClient({
        apiKey: key,
        baseURL: isXai ? 'https://api.x.ai/v1' : undefined,
        provider: isXai ? 'xai' : 'openai',
      })
      await testClient.messages.create({
        model: isXai ? 'grok-3-mini' : 'gpt-4o-mini',
        max_tokens: 5,
        messages: [{ role: 'user', content: 'hi' }],
      })
      return NextResponse.json({ working: true, provider: isXai ? 'xai' : 'openai' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const friendly = msg.includes('401') || msg.includes('invalid')
        ? 'Invalid API key'
        : msg.includes('403')
        ? 'Key does not have permission'
        : msg.slice(0, 120)
      return NextResponse.json({ working: false, error: friendly })
    }
  }

  return NextResponse.json({ error: 'Unknown provider' }, { status: 400 })
}
