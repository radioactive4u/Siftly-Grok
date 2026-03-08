import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

// ── Constants ─────────────────────────────────────────────────────────────────

const BEARER =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA'

const FEATURES = JSON.stringify({
  rweb_video_screen_enabled: false,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_profile_redirect_enabled: false,
  rweb_tipjar_consumption_enabled: false,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: true,
  responsive_web_jetfuel_frame: true,
  responsive_web_grok_share_attachment_enabled: true,
  responsive_web_grok_annotations_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  content_disclosure_indicator_enabled: true,
  content_disclosure_ai_generated_indicator_enabled: true,
  responsive_web_grok_show_grok_translated_post: false,
  responsive_web_grok_analysis_button_from_backend: true,
  post_ctas_fetch_enabled: true,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: false,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_grok_imagine_annotation_enabled: true,
  responsive_web_grok_community_note_auto_translation_is_enabled: false,
  responsive_web_enhance_cards_enabled: false,
})

// GraphQL query IDs — these may need updating if X deploys changes
const FOLDERS_QUERY_ID = 'i78YDd0Tza-dV4SYs58kRg'      // BookmarkFoldersSlice
const FOLDER_TIMELINE_QUERY_ID = 'LJDMo1aQOI3GG2pcNikQwQ' // BookmarkFolderTimeline

const FOLDER_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
  '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#06b6d4',
  '#84cc16', '#e879f9', '#22d3ee', '#a3e635', '#fb923c',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'folder'
}

async function xApiFetch(
  authToken: string,
  ct0: string,
  url: string,
  maxRetries = 3,
): Promise<unknown> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${BEARER}`,
        'X-Csrf-Token': ct0,
        Cookie: `auth_token=${authToken}; ct0=${ct0}`,
        'X-Twitter-Auth-Type': 'OAuth2Session',
        'X-Twitter-Active-User': 'yes',
        'X-Twitter-Client-Language': 'en',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: 'https://x.com/i/bookmarks',
      },
      signal: AbortSignal.timeout(30_000),
    })

    if (res.status === 429) {
      if (attempt < maxRetries) {
        // Use Retry-After header if present, otherwise exponential backoff
        const retryAfter = res.headers.get('retry-after')
        const waitSec = retryAfter ? parseInt(retryAfter, 10) : Math.pow(2, attempt + 1) * 15
        const waitMs = Math.min(waitSec * 1000, 120_000) // cap at 2 minutes
        console.log(`[folders] Rate limited (429). Waiting ${waitSec}s before retry ${attempt + 1}/${maxRetries}...`)
        await new Promise((r) => setTimeout(r, waitMs))
        continue
      }
      throw new Error('X API 429: Rate limit exceeded after retries. Wait a few minutes and try again.')
    }

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`X API ${res.status}: ${text.slice(0, 300)}`)
    }

    return res.json()
  }

  throw new Error('X API request failed after max retries')
}

// ── Folder list fetching ──────────────────────────────────────────────────────

interface XFolder {
  id: string
  name: string
}

async function fetchFolders(authToken: string, ct0: string): Promise<XFolder[]> {
  const variables = JSON.stringify({})
  const url = `https://x.com/i/api/graphql/${FOLDERS_QUERY_ID}/BookmarkFoldersSlice?variables=${encodeURIComponent(variables)}&features=${encodeURIComponent(FEATURES)}`

  const data = await xApiFetch(authToken, ct0, url)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any
  
  // X returns: data.viewer.user_results.result.bookmark_collections_slice.items[]
  const items =
    d?.data?.viewer?.user_results?.result?.bookmark_collections_slice?.items ??
    d?.data?.bookmark_collections_slice?.items ??
    d?.data?.bookmark_collections_slice?.slices ?? 
    d?.data?.bookmark_folders?.slices ??
    []

  const folders: XFolder[] = []
  for (const item of items) {
    const id = item?.id ?? item?.rest_id
    const name = item?.name ?? item?.title
    if (id && name) {
      folders.push({ id: String(id), name: String(name) })
    }
  }

  return folders
}

// ── Folder contents fetching ──────────────────────────────────────────────────

async function fetchFolderTweetIds(
  authToken: string,
  ct0: string,
  folderId: string,
): Promise<string[]> {
  const tweetIds: string[] = []
  let cursor: string | null = null
  let pages = 0
  const MAX_PAGES = 50 // Safety limit

  do {
    const variables = JSON.stringify({
      bookmark_collection_id: folderId,
      includePromotedContent: true,
      ...(cursor ? { cursor } : {}),
    })

    const url = `https://x.com/i/api/graphql/${FOLDER_TIMELINE_QUERY_ID}/BookmarkFolderTimeline?variables=${encodeURIComponent(variables)}&features=${encodeURIComponent(FEATURES)}`

    const data = await xApiFetch(authToken, ct0, url)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = data as any
    const instructions =
      d?.data?.bookmark_collection_timeline?.timeline?.instructions ??
      d?.data?.bookmark_folder_timeline?.timeline?.instructions ??
      []

    let foundTweets = false
    cursor = null

    for (const instruction of instructions) {
      if (instruction.type !== 'TimelineAddEntries') continue
      for (const entry of instruction.entries ?? []) {
        const content = entry.content
        if (content?.entryType === 'TimelineTimelineItem') {
          let tweet = content?.itemContent?.tweet_results?.result
          if (tweet?.__typename === 'TweetWithVisibilityResults' && tweet.tweet) {
            tweet = tweet.tweet
          }
          if (tweet?.rest_id) {
            tweetIds.push(String(tweet.rest_id))
            foundTweets = true
          }
        } else if (
          content?.entryType === 'TimelineTimelineCursor' &&
          content?.cursorType === 'Bottom'
        ) {
          cursor = content.value ?? null
        }
      }
    }

    pages++
    if (!foundTweets && pages > 1) break

    // Pause between pages to avoid rate limiting
    if (cursor) {
      await new Promise((r) => setTimeout(r, 2000))
    }
  } while (cursor && pages < MAX_PAGES)

  return tweetIds
}

// ── Main endpoint ─────────────────────────────────────────────────────────────

/**
 * POST /api/import/folders
 *
 * Fetches bookmark folders from X and maps existing bookmarks to categories.
 * Uses saved X credentials (x_auth_token + x_ct0) or accepts them in the body.
 *
 * Body (optional): { authToken?: string, ct0?: string }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { authToken?: string; ct0?: string } = {}
  try {
    const text = await request.text()
    if (text.trim()) body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Get credentials: prefer body, fall back to saved in DB
  let authToken = body.authToken?.trim() || ''
  let ct0 = body.ct0?.trim() || ''

  if (!authToken || !ct0) {
    const [savedAuth, savedCt0] = await Promise.all([
      prisma.setting.findUnique({ where: { key: 'x_auth_token' } }),
      prisma.setting.findUnique({ where: { key: 'x_ct0' } }),
    ])
    authToken = authToken || savedAuth?.value?.trim() || ''
    ct0 = ct0 || savedCt0?.value?.trim() || ''
  }

  if (!authToken || !ct0) {
    return NextResponse.json(
      { error: 'X credentials required. Save them in Settings → Live Sync, or pass authToken + ct0 in the request body.' },
      { status: 400 },
    )
  }

  try {
    // Step 1: Fetch folder list from X
    console.log('[folders] Fetching bookmark folders from X...')
    const folders = await fetchFolders(authToken, ct0)

    if (folders.length === 0) {
      return NextResponse.json({
        message: 'No bookmark folders found on X',
        folders: 0,
        categoriesCreated: 0,
        bookmarksAssigned: 0,
      })
    }

    console.log(`[folders] Found ${folders.length} folders: ${folders.map((f) => f.name).join(', ')}`)

    // Step 2: For each folder, fetch tweet IDs and create/map categories
    let categoriesCreated = 0
    let bookmarksAssigned = 0
    const folderResults: { name: string; tweetCount: number; assigned: number }[] = []

    for (let i = 0; i < folders.length; i++) {
      const folder = folders[i]
      const slug = generateSlug(folder.name)
      const color = FOLDER_COLORS[i % FOLDER_COLORS.length]

      console.log(`[folders] Processing folder "${folder.name}" (${i + 1}/${folders.length})...`)

      // Create or find the category
      let category = await prisma.category.findUnique({ where: { slug } })
      if (!category) {
        category = await prisma.category.create({
          data: {
            name: folder.name,
            slug,
            color,
            description: `User's X bookmark folder: "${folder.name}". Assign bookmarks that the user would file under this topic. Match content related to: ${folder.name.toLowerCase()}.`,
          },
        })
        categoriesCreated++
        console.log(`[folders] Created category "${folder.name}" (${slug})`)
      }

      // Fetch all tweet IDs in this folder
      const tweetIds = await fetchFolderTweetIds(authToken, ct0, folder.id)
      console.log(`[folders] Folder "${folder.name}" has ${tweetIds.length} bookmarks`)

      if (tweetIds.length === 0) {
        folderResults.push({ name: folder.name, tweetCount: 0, assigned: 0 })
        continue
      }

      // Match tweet IDs to existing bookmarks in batches
      const BATCH_SIZE = 500
      let assignedInFolder = 0

      for (let j = 0; j < tweetIds.length; j += BATCH_SIZE) {
        const batch = tweetIds.slice(j, j + BATCH_SIZE)
        const existingBookmarks = await prisma.bookmark.findMany({
          where: { tweetId: { in: batch } },
          select: { id: true, tweetId: true },
        })

        // Assign each matching bookmark to this category
        for (const bm of existingBookmarks) {
          try {
            await prisma.bookmarkCategory.upsert({
              where: {
                bookmarkId_categoryId: {
                  bookmarkId: bm.id,
                  categoryId: category.id,
                },
              },
              update: {},
              create: {
                bookmarkId: bm.id,
                categoryId: category.id,
                confidence: 1.0,
              },
            })
            assignedInFolder++
          } catch (err) {
            console.warn(`[folders] Failed to assign bookmark ${bm.tweetId} to "${folder.name}":`, err instanceof Error ? err.message : err)
          }
        }
      }

      bookmarksAssigned += assignedInFolder
      folderResults.push({ name: folder.name, tweetCount: tweetIds.length, assigned: assignedInFolder })
      console.log(`[folders] Assigned ${assignedInFolder} bookmarks to "${folder.name}"`)

      // Pause between folders to respect rate limits
      if (i < folders.length - 1) {
        await new Promise((r) => setTimeout(r, 3000))
      }
    }

    return NextResponse.json({
      message: `Synced ${folders.length} folders`,
      folders: folders.length,
      categoriesCreated,
      bookmarksAssigned,
      details: folderResults,
    })
  } catch (err) {
    console.error('[folders] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
