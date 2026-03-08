import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

interface MediaVariant {
  content_type?: string
  bitrate?: number
  url?: string
}

interface MediaEntity {
  type?: string
  media_url_https?: string
  video_info?: { variants?: MediaVariant[] }
}

interface TweetResult {
  rest_id?: string
  legacy?: {
    full_text?: string
    created_at?: string
    extended_entities?: { media?: MediaEntity[] }
    entities?: { media?: MediaEntity[] }
  }
  core?: {
    user_results?: {
      result?: { legacy?: { screen_name?: string; name?: string } }
    }
  }
}

function bestVideoUrl(variants: MediaVariant[]): string | null {
  return (
    variants
      .filter((v) => v.content_type === 'video/mp4' && v.url)
      .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0]?.url ?? null
  )
}

function extractMedia(tweet: TweetResult) {
  const entities =
    tweet.legacy?.extended_entities?.media ?? tweet.legacy?.entities?.media ?? []
  return entities
    .map((m) => {
      const thumb = m.media_url_https ?? ''
      if (m.type === 'video' || m.type === 'animated_gif') {
        const url = bestVideoUrl(m.video_info?.variants ?? []) ?? thumb
        if (!url) return null
        return { type: m.type === 'animated_gif' ? 'gif' : 'video', url, thumbnailUrl: thumb }
      }
      if (!thumb) return null
      return { type: 'photo' as const, url: thumb, thumbnailUrl: thumb }
    })
    .filter(Boolean) as { type: string; url: string; thumbnailUrl: string }[]
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { tweets?: TweetResult[]; source?: string; folder?: string } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS })
  }

  const source = body.source === 'like' ? 'like' : 'bookmark'
  const folderName = typeof body.folder === 'string' && body.folder.trim() ? body.folder.trim() : null
  const tweets = body.tweets ?? []
  if (!Array.isArray(tweets) || tweets.length === 0) {
    return NextResponse.json({ error: 'No tweets provided' }, { status: 400, headers: CORS })
  }

  // Batch dedup: check which tweet IDs already exist
  const tweetIds = tweets.map((t) => t.rest_id).filter(Boolean) as string[]
  const existingMap = new Map<string, string>()
  for (let i = 0; i < tweetIds.length; i += 500) {
    const batch = tweetIds.slice(i, i + 500)
    const existing = await prisma.bookmark.findMany({
      where: { tweetId: { in: batch } },
      select: { id: true, tweetId: true },
    })
    for (const b of existing) existingMap.set(b.tweetId, b.id)
  }

  // Create/find category for folder
  let folderCategoryId: string | null = null
  if (folderName) {
    const slug = folderName.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    if (slug) {
      const existing = await prisma.category.findFirst({
        where: { OR: [{ slug }, { name: folderName }] },
        select: { id: true },
      })
      if (existing) {
        folderCategoryId = existing.id
      } else {
        const COLORS = ['#8b5cf6','#06b6d4','#f59e0b','#10b981','#ec4899','#3b82f6','#f97316','#14b8a6','#a855f7','#ef4444']
        const colorIdx = (await prisma.category.count()) % COLORS.length
        const created = await prisma.category.create({
          data: { name: folderName, slug, color: COLORS[colorIdx], description: `Imported from X bookmark folder: ${folderName}`, isAiGenerated: false },
        })
        folderCategoryId = created.id
      }
    }
  }

  let imported = 0
  let skipped = 0
  let categoryAssigned = 0

  for (const tweet of tweets) {
    if (!tweet.rest_id) continue

    const existingId = existingMap.get(tweet.rest_id)
    if (existingId) {
      skipped++
      // Re-import: assign folder category to existing bookmark
      if (folderCategoryId) {
        try {
          await prisma.bookmarkCategory.upsert({
            where: { bookmarkId_categoryId: { bookmarkId: existingId, categoryId: folderCategoryId } },
            update: {},
            create: { bookmarkId: existingId, categoryId: folderCategoryId, confidence: 1.0 },
          })
          categoryAssigned++
        } catch { /* already assigned */ }
      }
      continue
    }

    const userLegacy = tweet.core?.user_results?.result?.legacy ?? {}
    const media = extractMedia(tweet)

    const created = await prisma.bookmark.create({
      data: {
        tweetId: tweet.rest_id,
        text: tweet.legacy?.full_text ?? '',
        authorHandle: userLegacy.screen_name ?? 'unknown',
        authorName: userLegacy.name ?? 'Unknown',
        tweetCreatedAt: tweet.legacy?.created_at
          ? new Date(tweet.legacy.created_at)
          : null,
        rawJson: JSON.stringify(tweet),
        source,
      },
    })

    if (media.length > 0) {
      await prisma.mediaItem.createMany({
        data: media.map((m) => ({
          bookmarkId: created.id,
          type: m.type,
          url: m.url,
          thumbnailUrl: m.thumbnailUrl ?? null,
        })),
      })
    }

    // Assign folder category to new bookmark
    if (folderCategoryId) {
      await prisma.bookmarkCategory.create({
        data: { bookmarkId: created.id, categoryId: folderCategoryId, confidence: 1.0 },
      })
      categoryAssigned++
    }

    imported++
  }

  return NextResponse.json({ imported, skipped, folder: folderName, categoriesAssigned: categoryAssigned }, { headers: CORS })
}
