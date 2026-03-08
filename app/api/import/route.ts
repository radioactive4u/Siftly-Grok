import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { parseBookmarksJson } from '@/lib/parser'

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

// Palette for auto-created X folder categories
const FOLDER_COLORS = [
  '#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#ec4899',
  '#3b82f6', '#f97316', '#14b8a6', '#a855f7', '#ef4444',
  '#6366f1', '#eab308', '#22c55e', '#e879f9', '#0ea5e9',
]

const DEDUP_BATCH = 500

export async function POST(request: NextRequest): Promise<NextResponse> {
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Failed to parse form data' }, { status: 400 })
  }

  const sourceParam = (formData.get('source') as string | null)?.trim()
  const file = formData.get('file')
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json(
      { error: 'Missing required field: file' },
      { status: 400 }
    )
  }

  const filename =
    file instanceof File ? file.name : 'bookmarks.json'

  let jsonString: string
  try {
    jsonString = await file.text()
  } catch {
    return NextResponse.json({ error: 'Failed to read file content' }, { status: 400 })
  }

  // Create an import job to track progress
  const importJob = await prisma.importJob.create({
    data: {
      filename,
      status: 'processing',
      totalCount: 0,
      processedCount: 0,
    },
  })

  let parsedBookmarks
  try {
    parsedBookmarks = parseBookmarksJson(jsonString)
  } catch (err) {
    await prisma.importJob.update({
      where: { id: importJob.id },
      data: {
        status: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    })
    return NextResponse.json(
      { error: `Failed to parse bookmarks JSON: ${err instanceof Error ? err.message : String(err)}` },
      { status: 422 }
    )
  }

  // ── Extract top-level metadata (source, folder) ──────────────────────────
  let jsonSource: string | undefined
  let jsonFolder: string | undefined
  try {
    const parsed = JSON.parse(jsonString)
    if (typeof parsed?.source === 'string') jsonSource = parsed.source
    if (typeof parsed?.folder === 'string' && parsed.folder.trim()) jsonFolder = parsed.folder.trim()
  } catch { /* already parsed above */ }

  const source = (sourceParam === 'like' || sourceParam === 'bookmark')
    ? sourceParam
    : (jsonSource === 'like' ? 'like' : 'bookmark')

  await prisma.importJob.update({
    where: { id: importJob.id },
    data: { totalCount: parsedBookmarks.length },
  })

  // ── Batch dedup: check which tweetIds already exist ────────────────────
  const allTweetIds = parsedBookmarks.map((b) => b.tweetId)
  const existingMap = new Map<string, string>() // tweetId → bookmarkId

  for (let i = 0; i < allTweetIds.length; i += DEDUP_BATCH) {
    const batch = allTweetIds.slice(i, i + DEDUP_BATCH)
    const existing = await prisma.bookmark.findMany({
      where: { tweetId: { in: batch } },
      select: { id: true, tweetId: true },
    })
    for (const b of existing) {
      existingMap.set(b.tweetId, b.id)
    }
  }

  // ── Create categories from X bookmark folders ─────────────────────────
  const folderNames = new Set<string>()
  if (jsonFolder) folderNames.add(jsonFolder)
  for (const b of parsedBookmarks) {
    if (b.folder) folderNames.add(b.folder)
  }

  const folderCategoryMap = new Map<string, { id: string; name: string }>()
  let categoriesCreated = 0

  for (const name of folderNames) {
    const slug = generateSlug(name)
    if (!slug) continue
    const existing = await prisma.category.findFirst({
      where: { OR: [{ slug }, { name }] },
      select: { id: true, name: true },
    })
    if (existing) {
      folderCategoryMap.set(name, { id: existing.id, name: existing.name })
    } else {
      const colorIdx = (await prisma.category.count()) % FOLDER_COLORS.length
      const created = await prisma.category.create({
        data: {
          name,
          slug,
          color: FOLDER_COLORS[colorIdx],
          description: `Imported from X bookmark folder: ${name}`,
          isAiGenerated: false,
        },
      })
      folderCategoryMap.set(name, { id: created.id, name: created.name })
      categoriesCreated++
    }
  }

  // ── Import bookmarks ──────────────────────────────────────────────────
  let importedCount = 0
  let skippedCount = 0
  let categoryAssignedCount = 0

  for (const bookmark of parsedBookmarks) {
    const effectiveFolder = bookmark.folder || jsonFolder
    const folderCategory = effectiveFolder ? folderCategoryMap.get(effectiveFolder) : null
    const existingId = existingMap.get(bookmark.tweetId)

    if (existingId) {
      skippedCount++
      // Re-import: assign folder category to existing bookmarks
      if (folderCategory) {
        try {
          await prisma.bookmarkCategory.upsert({
            where: { bookmarkId_categoryId: { bookmarkId: existingId, categoryId: folderCategory.id } },
            update: {},
            create: { bookmarkId: existingId, categoryId: folderCategory.id, confidence: 1.0 },
          })
          categoryAssignedCount++
        } catch { /* already assigned */ }
      }
      continue
    }

    try {
      const created = await prisma.bookmark.create({
        data: {
          tweetId: bookmark.tweetId,
          text: bookmark.text,
          authorHandle: bookmark.authorHandle,
          authorName: bookmark.authorName,
          tweetCreatedAt: bookmark.tweetCreatedAt,
          rawJson: bookmark.rawJson,
          source,
        },
      })

      if (bookmark.media.length > 0) {
        await prisma.mediaItem.createMany({
          data: bookmark.media.map((m) => ({
            bookmarkId: created.id,
            type: m.type,
            url: m.url,
            thumbnailUrl: m.thumbnailUrl ?? null,
          })),
        })
      }

      // Assign folder category to new bookmark
      if (folderCategory) {
        await prisma.bookmarkCategory.create({
          data: { bookmarkId: created.id, categoryId: folderCategory.id, confidence: 1.0 },
        })
        categoryAssignedCount++
      }

      importedCount++
    } catch (err) {
      console.error(`Failed to import tweet ${bookmark.tweetId}:`, err)
      skippedCount++
    }
  }

  await prisma.importJob.update({
    where: { id: importJob.id },
    data: {
      status: 'done',
      processedCount: importedCount,
    },
  })

  return NextResponse.json({
    jobId: importJob.id,
    count: importedCount,
    skipped: skippedCount,
    folder: jsonFolder ?? null,
    categoriesCreated,
    categoriesAssigned: categoryAssignedCount,
  })
}
