# Siftly-Grok — AI Agent Guide

Windows fork of Siftly with xAI/Grok support, X bookmark folder sync, and large-library fixes.

**This is a Windows-targeted project.** Use PowerShell commands, not bash. Avoid macOS/Linux assumptions.

## Quick Setup

```powershell
# Install dependencies
npm install

# Generate Prisma client + create local SQLite database
npx prisma generate
npx prisma db push

# Start the dev server (clears stale Turbopack cache first)
npm run dev:clean
```

App runs at **http://localhost:3000**

For a single command that does everything + opens the browser:
```powershell
.\start.ps1
```

## AI Providers

This fork supports **three AI providers** — xAI (Grok), Anthropic (Claude), and OpenAI. Configure in the Settings page.

How provider resolution works:
- `lib/claude-cli-auth.ts` → `resolveAnyClient()` checks: Claude CLI → DB API key → env var → local proxy
- `lib/openai-client.ts` → `OpenAICompatClient` wraps xAI/OpenAI APIs with Anthropic SDK interface
- `lib/settings.ts` → cached lookups for `openaiApiKey`, `openaiModel`, `openaiBaseUrl`

Provider is auto-detected from the API key prefix:
- `xai-...` → xAI (Grok) — base URL: `https://api.x.ai/v1`
- `sk-...` → OpenAI — base URL: `https://api.openai.com/v1`
- `sk-ant-...` → Anthropic (Claude)

## Key Commands

```powershell
npm run dev:clean     # Clear .next cache + start dev server
npx next dev          # Start dev server (port 3000)
npx tsc --noEmit      # Type check (must pass with zero errors)
npx prisma studio     # Database GUI
npx prisma db push    # Apply schema changes to DB
npm run build         # Production build
```

## Project Structure

```
app/
  api/
    categorize/       # 4-stage AI pipeline — 8 workers, chunks of 250, per-bookmark 45s timeout
    import/           # Bookmark JSON import + batch dedup (500 at a time)
      bookmarklet/    # Bookmarklet import with folder detection
      folders/        # X bookmark folder sync via GraphQL API
      live/           # Live X sync
      twitter/        # Twitter-specific import
    search/ai/        # FTS5 + AI semantic search
    settings/
      cli-status/     # GET — Claude CLI auth status
      test/           # POST — validates any provider's API key
    analyze/images/   # Vision analysis (30s timeout per image)
    bookmarks/        # CRUD + filtering
    categories/       # Category management
    mindmap/          # Graph data for visualization
    stats/            # Dashboard counts
    export/           # CSV, JSON, ZIP export
  import/             # 3-step import UI with folder sync button
  mindmap/            # Interactive force graph
  settings/           # API keys, model selection, X credentials
  ai-search/          # Natural language search UI
  bookmarks/          # Browse + filter UI
  categorize/         # Pipeline monitor with progress

lib/
  claude-cli-auth.ts  # Unified AI client resolver (Claude CLI + SDK + xAI/OpenAI)
  openai-client.ts    # xAI/OpenAI compatible client with Anthropic SDK adapter
  categorizer.ts      # AI categorization + default categories (uses ALL DB categories)
  vision-analyzer.ts  # Image vision + semantic tagging (with timeouts)
  settings.ts         # Cached settings lookups (model, keys, base URL)
  fts.ts              # SQLite FTS5 full-text search
  rawjson-extractor.ts # Entity extraction from tweet JSON
  parser.ts           # Multi-format bookmark JSON parser (with folder field)
  exporter.ts         # CSV / JSON / ZIP export
  db.ts               # Prisma client singleton

prisma/schema.prisma  # SQLite schema (Bookmark, Category, MediaItem, Setting, ImportJob)
start.ps1             # Windows one-command launcher
cli/siftly.ts         # CLI for direct DB access
```

## Tech Stack

- **Next.js 16** (App Router, Turbopack, TypeScript)
- **Prisma 7** + **SQLite** (local, zero setup, FTS5)
- **Anthropic SDK** — Claude provider
- **xAI API** — Grok provider (via OpenAI-compatible wrapper)
- **@xyflow/react** — mindmap graph
- **Tailwind CSS v4**

## Environment Variables

Only `DATABASE_URL` is required:

```env
DATABASE_URL="file:./prisma/dev.db"       # required — set by default in .env
ANTHROPIC_API_KEY=sk-ant-...              # optional — can set in Settings UI instead
ANTHROPIC_BASE_URL=http://localhost:8080  # optional — for local proxies
```

xAI/OpenAI keys and X credentials are managed through the Settings UI and stored in the `Setting` table.

## Fork-Specific Architecture

### X Bookmark Folder Sync (`app/api/import/folders/route.ts`)

POST endpoint that syncs X bookmark folders to Siftly categories via X's GraphQL API.

- Uses query IDs: `BookmarkFoldersSlice` and `BookmarkFolderTimeline`
- Authenticates with saved `x_auth_token` + `x_ct0` from the Settings/DB
- Creates matching categories with AI-useful descriptions
- Assigns bookmarks by tweet ID with `confidence: 1.0`
- Rate limit handling: exponential backoff on 429 (30s → 60s → 120s)
- Inter-folder delay: 3s. Inter-page delay: 2s.

### Pipeline Chunking (`app/api/categorize/route.ts`)

- `PIPELINE_WORKERS = 8` (down from upstream's 20)
- `MEGA_CHUNK_SIZE = 250` with `CHUNK_DELAY_MS = 2000` between chunks
- Per-bookmark wrapper: 45s timeout + 500ms abort polling
- Vision: 30s timeout. Enrichment: 60s timeout.
- Stop button checks `shouldAbort()` in loop + via `setInterval`

### Category System

`seedDefaultCategories()` only updates its own built-in defaults — never overwrites user-created or folder-synced categories.

`categorizeAll()` and the pipeline both load ALL categories from the DB (including user-created and folder-synced) and pass them to the AI prompt.

### Batch Dedup

Import routes use `findMany` with `tweetId: { in: batch }` in chunks of 500 instead of sequential `findUnique` calls.

## CLI for AI Agents

`cli/siftly.ts` provides direct database access without the dev server:

```powershell
npx tsx cli/siftly.ts stats                          # Library statistics
npx tsx cli/siftly.ts categories                     # Categories with counts
npx tsx cli/siftly.ts search "AI agents"             # FTS5 keyword search
npx tsx cli/siftly.ts list --limit 5                 # Recent bookmarks
npx tsx cli/siftly.ts list --category hacking        # Filter by category
npx tsx cli/siftly.ts show <id|tweetId>              # Full bookmark detail
```

## Common Tasks

### Add a new default category
Edit `DEFAULT_CATEGORIES` in `lib/categorizer.ts`. Add name, slug, color, and description. The description is passed verbatim to the AI — be specific.

### Add a known tool for entity extraction
Append a domain string to `KNOWN_TOOL_DOMAINS` in `lib/rawjson-extractor.ts`.

### Test API auth
```powershell
curl -X POST http://localhost:3000/api/settings/test -H "Content-Type: application/json" -d '{\"provider\":\"anthropic\"}'
# Returns: {"working": true}
```

### Sync X bookmark folders
```powershell
curl -X POST http://localhost:3000/api/import/folders
# Uses saved X credentials from DB. Returns folder sync results.
```

### Run the AI pipeline
POST to `/api/categorize` with `{}` body. Monitor via GET `/api/categorize` (SSE).

## Database

SQLite file at `prisma/dev.db`. Schema models:

- `Bookmark` — tweet text, author, raw JSON, semantic tags, enrichment metadata
- `MediaItem` — images/videos/GIFs with AI visual tags
- `BookmarkCategory` — bookmark↔category with confidence score (0–1)
- `Category` — name, slug, color, AI description
- `Setting` — key/value store (API keys, model choice, X credentials)
- `ImportJob` — import file tracking

After schema changes: `npx prisma db push`

## Windows Notes

- Turbopack persistent cache is disabled (`TURBOPACK_PERSISTENT_CACHE=0` in `next.config.ts`) to avoid RocksDB SST write failures
- Clear `.next/` if routes return 404 after code changes: `npm run dev:clean`
- Use `.\start.ps1` instead of `./start.sh`
