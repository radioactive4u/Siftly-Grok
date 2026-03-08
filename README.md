<div align="center">
  <img src="public/logo.svg" alt="Siftly-Grok" width="80" height="80" />

  <h1>Siftly-Grok</h1>

  <p><strong>Windows fork of <a href="https://github.com/viperrcrypto/Siftly">Siftly</a> with xAI/Grok support, X folder sync, and large-library fixes</strong></p>

  <p>Import · Sync Folders · Categorize · Search · Explore</p>

  <p>
    <img src="https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js" alt="Next.js 16" />
    <img src="https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript" alt="TypeScript" />
    <img src="https://img.shields.io/badge/SQLite-local-green?style=flat-square&logo=sqlite" alt="SQLite" />
    <img src="https://img.shields.io/badge/xAI%20Grok-supported-orange?style=flat-square" alt="xAI Grok" />
    <img src="https://img.shields.io/badge/platform-Windows-0078D6?style=flat-square&logo=windows" alt="Windows" />
    <img src="https://img.shields.io/badge/license-MIT-yellow?style=flat-square" alt="MIT License" />
  </p>
</div>

---

## What is Siftly-Grok?

A self-hosted Twitter/X bookmark manager that turns thousands of bookmarks into a **searchable, categorized, visual knowledge base** — running entirely on your machine.

This is a fork of [viperrcrypto/Siftly](https://github.com/viperrcrypto/Siftly) that adds:

- **xAI (Grok) as an AI provider** — use Grok 3, Grok 3 Mini, or Grok 2 Vision instead of Claude
- **X bookmark folder sync** — import your X folder organization directly as categories
- **Large library support** — chunked processing that handles 4,000+ bookmarks without crashing
- **Windows-first** — Turbopack fixes, PowerShell launcher, Windows-tested throughout

Everything stays local except the AI API calls you configure. No cloud, no subscriptions, no browser extensions.

---

## Fork Changes from Upstream

This section documents every significant change from the [original Siftly](https://github.com/viperrcrypto/Siftly).

### xAI / Grok Provider

The original Siftly only supports Anthropic (Claude). This fork adds full support for **xAI's Grok models** via the OpenAI-compatible API, plus standard OpenAI models.

| Model | Best For |
|-------|----------|
| **Grok 3** | Full-power categorization and search |
| **Grok 3 Mini** | Fast and cheap (default) |
| **Grok 2 Vision** | Image analysis |
| **Grok 2** | Text-only tasks |
| **GPT-4o / GPT-4o Mini** | OpenAI alternative |

Configure in Settings → paste your xAI key (`xai-...`) or OpenAI key (`sk-...`).

### X Bookmark Folder Sync

Siftly-Grok can pull your X bookmark folder structure and automatically create matching categories with bookmark assignments — **no manual categorization needed**.

This uses X's GraphQL API with your saved auth credentials to:
1. Fetch all your bookmark folders (e.g., "Hacking", "AI", "Health")
2. Create a Siftly category for each folder
3. Match bookmarks by tweet ID and assign them to the correct category

Includes rate limit retry with exponential backoff (429 handling) and respects X API limits with delays between requests.

### Large Library Fixes (4,000+ Bookmarks)

The upstream pipeline crashes or hangs on large bookmark libraries. This fork fixes that:

| Problem | Fix |
|---------|-----|
| Pipeline crashes processing 4,000+ bookmarks at once | **Mega-chunks of 250** with commit points between chunks |
| Workers overwhelm the system | **8 concurrent workers** (down from 20) |
| Pipeline hangs on deleted/broken tweets | **Per-bookmark 45s timeout** with automatic skip |
| Vision API calls hang indefinitely | **30s timeout** on image analysis calls |
| Enrichment API calls hang indefinitely | **60s timeout** on semantic tagging calls |
| Stop button unresponsive during processing | **500ms abort polling** — stop takes effect within half a second |

### Batch Dedup for Re-imports

The upstream deduplication checks bookmarks one-by-one (`findUnique` in a loop). This fork uses **batch lookups** (`findMany` with `tweetId: { in: batch }`) in chunks of 500, making re-imports dramatically faster on large libraries.

### Bookmarklet & Console Folder Detection

The export bookmarklet and console script now detect which X bookmark folder you're viewing and include the folder name in the exported JSON. When imported, Siftly automatically creates a matching category and assigns the bookmarks.

Detection uses: URL path → DOM heading → page title (fallback chain).

### AI Categorization Uses All Categories

The AI pipeline now uses **every category in the database** — both the built-in defaults and any user-created or folder-synced categories. The upstream only used hardcoded defaults.

Folder-synced categories get AI-useful descriptions so the model knows when to assign bookmarks to them. Running the AI pipeline after folder sync will:
- Keep your existing folder assignments (upsert, not replace)
- Potentially assign additional categories where relevant
- Add entity extraction, vision analysis, and semantic tagging

### Windows Platform Fixes

| Fix | Details |
|-----|---------|
| Turbopack RocksDB crash | `next.config.ts` disables persistent cache (`TURBOPACK_PERSISTENT_CACHE=0`) |
| `start.ps1` launcher | PowerShell equivalent of `start.sh` — installs deps, generates Prisma, creates DB, clears cache, starts server, opens browser |
| `dev:clean` script | `npm run dev:clean` clears `.next/` cache before starting (fixes stale route 404s) |
| Stale route 404s | Turbopack on Windows caches old routes after code changes — clearing `.next/` resolves it |

### Default Categories Auto-Seed

Categories are automatically seeded on first API call, so the app works out of the box without running the AI pipeline first. `seedDefaultCategories()` only updates its own built-in categories — it never overwrites user-created or folder-synced category names/descriptions.

---

## Quick Start

### Prerequisites

| Requirement | Version |
|---|---|
| **OS** | Windows 10/11 (x64) |
| **Node.js** | 22.x+ |
| **npm** | 11.x+ |
| **Disk** | ~500 MB for dependencies + database |
| **Browser** | Chrome, Edge, or Firefox |

### Option A — One command (recommended)

```powershell
git clone https://github.com/radioactive4u/Siftly-Grok.git
cd Siftly-Grok
.\start.ps1
```

`start.ps1` installs dependencies, generates the Prisma client, creates the database, clears stale cache, starts the dev server, and opens your browser.

### Option B — Manual setup

```powershell
git clone https://github.com/radioactive4u/Siftly-Grok.git
cd Siftly-Grok
npm install
npx prisma generate
npx prisma db push
npx next dev
```

Open [http://localhost:3000](http://localhost:3000)

### Configure Your AI Provider

1. Open **http://localhost:3000/settings**
2. Paste your API key:
   - **xAI (Grok):** `xai-...` — get one at [console.x.ai](https://console.x.ai)
   - **Anthropic (Claude):** `sk-ant-...` — get one at [console.anthropic.com](https://console.anthropic.com)
   - **OpenAI:** `sk-...` — get one at [platform.openai.com](https://platform.openai.com)
3. Select a model (Grok 3 Mini is the default)
4. Click **Test Connection** to verify

---

## Recommended Workflow

The most effective way to use Siftly-Grok with a large bookmark library:

### Step 1 — Import Your Bookmarks

Go to **Import** (`/import`) and follow the 3-step process:

**Bookmarklet method (recommended):**
1. Drag the **"Export X Bookmarks"** link to your bookmark bar
2. Go to [x.com/i/bookmarks](https://x.com/i/bookmarks)
3. Click the bookmarklet → click **"Auto-scroll"** → wait for it to finish
4. Click **"Export N bookmarks"** → `bookmarks.json` downloads
5. Upload the file in Siftly

**Console script method:**
1. Go to [x.com/i/bookmarks](https://x.com/i/bookmarks)
2. Open DevTools (`F12`) → Console tab
3. Paste the script from the Import page → press Enter
4. Click **"Auto-scroll"** → export → upload in Siftly

Re-importing is safe — duplicates are automatically skipped via batch dedup.

> **Tip:** If you're viewing a specific X bookmark folder when you run the export, the folder name is detected and bookmarks are automatically assigned to a matching category on import.

### Step 2 — Sync X Bookmark Folders (Optional but Recommended)

If you organize bookmarks into folders on X, sync them to Siftly as categories:

1. Save your X auth credentials in **Settings** → **Live Import** tab (auth_token + ct0 from browser cookies)
2. Go to **Import** → click the **"Sync Folders"** button (amber, appears after import)
3. Siftly fetches your folder structure from X, creates matching categories, and assigns bookmarks

This takes 2–4 minutes for ~20 folders. Rate limit retries are handled automatically.

**What you need (from browser DevTools → Application → Cookies → x.com):**
- `auth_token` — your X session token
- `ct0` — your X CSRF token

### Step 3 — Run the AI Pipeline (Optional)

For richer search, semantic tags, and image analysis:

1. Go to **Categorize** (`/categorize`)
2. Click **"Start AI Pipeline"**
3. The 4-stage pipeline runs:
   - **Entity Extraction** — hashtags, URLs, tools (free, no API calls)
   - **Vision Analysis** — image OCR, objects, scene tags
   - **Semantic Tagging** — 25–35 searchable tags per bookmark
   - **Categorization** — assigns 1–3 categories with confidence scores

The pipeline uses all categories in the database — including your folder-synced ones. Your existing folder assignments are preserved; the AI may add supplementary category assignments.

Processing runs in chunks of 250 with 8 workers. For 4,000 bookmarks, expect ~30–60 minutes depending on your AI provider's speed.

### Step 4 — Browse, Search, and Explore

- **Browse** (`/bookmarks`) — grid or list view, filter by category/media type
- **AI Search** (`/ai-search`) — natural language queries like *"funny meme about crypto"*
- **Mindmap** (`/mindmap`) — interactive graph of all categories and bookmarks
- **Categories** (`/categories`) — manage and customize categories
- **Export** — CSV, JSON, or ZIP with media files

---

## Features

### AI Search

Natural language search across all bookmark data — tweet text, image OCR, visual tags, semantic tags, and categories. Uses FTS5 full-text search with AI semantic reranking.

### Mindmap

Interactive force-directed graph showing all bookmarks organized by category. Expand/collapse categories, click bookmarks to open on X, color-coded by category.

### Browse & Filter

Grid (masonry) or list view with category, media type, and text filters. Sort by newest/oldest, paginated at 24 per page.

### Export

- **CSV** — all fields, spreadsheet-compatible
- **JSON** — full structured data
- **ZIP** — bookmarks + media files with manifest

### Command Palette

`Ctrl+K` — search across all bookmarks from anywhere in the app.

---

## Troubleshooting

### Server returns 500 on all routes

Delete the `.next` directory and restart:

```powershell
Remove-Item -Recurse -Force .next
npx next dev
```

Or use the clean start script:

```powershell
npm run dev:clean
```

### Turbopack cache errors (SST file write failures)

The fix is baked into `next.config.ts`. If you still see errors, force Webpack:

```powershell
$env:NEXT_FORCE_WEBPACK="1"
npx next dev
```

### Pipeline hangs or stops making progress

The pipeline has per-bookmark timeouts (45s) and will skip problematic tweets automatically. If it truly stalls:

1. Click **"Stop"** — takes effect within 500ms
2. Wait a few seconds, then restart — the pipeline picks up where it left off

### Folder sync rate limited (429)

The sync automatically retries with exponential backoff (30s → 60s → 120s). If it still fails, wait a few minutes and try again. X rate limits reset on a rolling window.

### Port 3000 already in use

```powershell
npx next dev --port 3001
```

---

## Configuration

| Setting | Env Var | Description |
|---------|---------|-------------|
| xAI / OpenAI API Key | Settings page | For Grok or GPT models |
| Anthropic API Key | `ANTHROPIC_API_KEY` | For Claude models |
| API Base URL | `ANTHROPIC_BASE_URL` | Custom endpoint for proxies |
| AI Model | Settings page | Grok 3 Mini (default), Grok 3, GPT-4o, Claude, etc. |
| Database | `DATABASE_URL` | SQLite path (default: `file:./prisma/dev.db`) |
| X Auth Token | Settings page | For folder sync and live import |
| X CT0 Token | Settings page | For folder sync and live import |

---

## Project Structure

```
app/
  api/
    analyze/images/       # Batch image vision analysis
    bookmarks/            # CRUD + filtering
    categories/           # Category management
    categorize/           # 4-stage AI pipeline (chunked, 8 workers)
    export/               # CSV, JSON, ZIP
    import/               # File import with batch dedup
      bookmarklet/        # Bookmarklet import endpoint
      folders/            # X bookmark folder sync (GraphQL API)
      live/               # Live X sync
      twitter/            # Twitter-specific import
    link-preview/         # OG metadata scraper
    media/                # Media proxy
    mindmap/              # Graph data
    search/ai/            # FTS5 + AI semantic search
    settings/             # API keys, model config
      cli-status/         # Claude CLI auth status
      test/               # API key validation
    stats/                # Dashboard counts

lib/
  categorizer.ts          # AI categorization + default categories
  claude-cli-auth.ts      # Unified AI client resolver
  openai-client.ts        # xAI/OpenAI compatible client wrapper
  vision-analyzer.ts      # Image analysis with timeouts
  fts.ts                  # SQLite FTS5 full-text search
  rawjson-extractor.ts    # Entity extraction from tweet JSON
  parser.ts               # Multi-format JSON parser (with folder field)
  exporter.ts             # CSV / JSON / ZIP export
  settings.ts             # Cached model/key lookups
  db.ts                   # Prisma client singleton

components/
  mindmap/                # Mindmap canvas, nodes, edges
  bookmark-card.tsx       # Bookmark display card
  command-palette.tsx     # Ctrl+K global search
  nav.tsx                 # Sidebar navigation

prisma/schema.prisma      # SQLite schema
start.ps1                 # Windows one-command launcher
cli/siftly.ts             # CLI for direct DB access
```

### Database Schema

```
Bookmark          — tweet text, author, date, raw JSON, semantic tags, enrichment metadata
  ├── MediaItem   — images / videos / GIFs with AI-generated visual tags
  └── BookmarkCategory — category assignments with confidence scores (0–1)

Category          — name, slug, hex color, AI-readable description
Setting           — key-value store (API keys, model preferences, X credentials)
ImportJob         — import file tracking
```

---

## Tech Stack

| Technology | Role |
|------------|------|
| [Next.js 16](https://nextjs.org) | Full-stack framework (App Router, Turbopack) |
| [TypeScript 5](https://www.typescriptlang.org) | Type safety |
| [Prisma 7](https://www.prisma.io) | ORM + migrations |
| [SQLite](https://sqlite.org) | Local database with FTS5 |
| [Tailwind CSS v4](https://tailwindcss.com) | Styling |
| [Anthropic SDK](https://anthropic.com) | Claude AI provider |
| [xAI API](https://x.ai) | Grok AI provider (OpenAI-compatible) |
| [@xyflow/react](https://xyflow.com) | Interactive mindmap |
| [Framer Motion](https://www.framer.com/motion/) | Animations |
| [Radix UI](https://www.radix-ui.com) | Accessible UI primitives |

---

## CLI

`cli/siftly.ts` provides direct database access without the dev server. Outputs JSON.

```powershell
npx tsx cli/siftly.ts stats                          # Library statistics
npx tsx cli/siftly.ts categories                     # Categories with counts
npx tsx cli/siftly.ts search "AI agents"             # FTS5 keyword search
npx tsx cli/siftly.ts list --limit 5                 # Recent bookmarks
npx tsx cli/siftly.ts list --category hacking        # Filter by category
npx tsx cli/siftly.ts show <id|tweetId>              # Full bookmark detail
```

---

## Development

```powershell
# One-command start
.\start.ps1

# Or manually
npm install
npx prisma generate
npx prisma db push
npx next dev

# Clean start (clears stale cache)
npm run dev:clean

# Type check
npx tsc --noEmit

# Database GUI
npx prisma studio

# Production build
npm run build; npm start
```

### Customizing Categories

Edit `DEFAULT_CATEGORIES` in `lib/categorizer.ts`. The `description` field is passed verbatim to the AI — be specific about what content belongs in the category.

You can also create categories through:
- The Categories page in the UI
- X bookmark folder sync (auto-created with AI-useful descriptions)

### Adding Known Tools

Add domain strings to `KNOWN_TOOL_DOMAINS` in `lib/rawjson-extractor.ts` to have the entity extractor recognize links to those tools in tweet data.

---

## Upstream

Original project: [github.com/viperrcrypto/Siftly](https://github.com/viperrcrypto/Siftly)

The upstream README is preserved as [UPSTREAM-README.md](UPSTREAM-README.md).

To pull upstream changes:

```powershell
git remote add upstream https://github.com/viperrcrypto/Siftly.git
git fetch upstream
git merge upstream/main
```

---

## Privacy

- All data stored **locally** in a SQLite file
- External calls only to your configured AI provider (tweet text + images)
- X API calls only when you explicitly trigger folder sync (uses your own auth cookies)
- No telemetry, no tracking, no accounts

---

## License

MIT — see [LICENSE](LICENSE)

---

<div align="center">
  <p>
    Fork by <a href="https://github.com/radioactive4u">@radioactive4u</a> · 
    Original by <a href="https://x.com/viperr">@viperr</a> · 
    Self-hosted · No extensions · No cloud
  </p>
</div>
