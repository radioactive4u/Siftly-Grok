# Siftly-Grok — Windows Fork with xAI/Grok Support

**Fork of [viperrcrypto/Siftly](https://github.com/viperrcrypto/Siftly)**

This fork adds **xAI (Grok) as an AI provider** and includes **Windows-specific fixes** that are not in the upstream project.

---

## What Changed in This Fork

### xAI / Grok Provider Support

The original Siftly only supports Anthropic (Claude) for AI features. This fork adds full support for **xAI's Grok models** via the OpenAI-compatible API.

Supported Grok models:
- **Grok 3** — full-power model
- **Grok 3 Mini** — fast and cheap (default)
- **Grok 2 Vision** — image analysis
- **Grok 2** — text only

You can use your xAI API key (starts with `xai-`) or a standard OpenAI key (starts with `sk-`). Configure it in the Settings page at `http://localhost:3000/settings`.

**Files added/modified:**
- `lib/openai-client.ts` — OpenAI-compatible client wrapper with Anthropic SDK interface adapter
- `lib/claude-cli-auth.ts` — unified client resolver (`resolveAnyClient()`) tries Anthropic first, falls back to xAI/OpenAI
- `lib/settings.ts` — cached model lookup for OpenAI provider
- `lib/categorizer.ts` — provider-aware model selection
- `lib/vision-analyzer.ts` — provider-aware image analysis
- `app/api/categorize/route.ts` — uses unified client
- `app/api/analyze/images/route.ts` — uses unified client
- `app/api/search/ai/route.ts` — uses unified client
- `app/api/settings/route.ts` — accepts `xai-` key prefix, adds Grok models
- `app/api/settings/test/route.ts` — xAI provider test endpoint
- `app/settings/page.tsx` — Grok model selector, xAI branding

### Windows Turbopack Fix

Next.js 16 uses Turbopack by default. On Windows, Turbopack's RocksDB persistent cache fails to write SST files, causing:

```
Persisting failed: Unable to write SST file 00000001.sst
Caused by: The system cannot find the path specified. (os error 3)
```

This results in missing build manifests and **500 errors on every route**.

**Fix:** `next.config.ts` sets `TURBOPACK_PERSISTENT_CACHE=0` at config load time, disabling the broken cache while keeping Turbopack's fast compilation.

### Default Categories Auto-Seed

Added automatic seeding of default categories on first `GET /api/categories` call, so the app works out of the box without running the AI pipeline first.

---

## Target Platform

| Requirement | Version |
|---|---|
| **OS** | Windows 10/11 (x64) |
| **Node.js** | 22.x (tested on v22.12.0) |
| **npm** | 11.x |
| **Disk** | ~500 MB for dependencies + database |
| **Browser** | Any modern browser (Chrome, Edge, Firefox) |

> **Note:** The upstream Siftly works on macOS and Linux. This fork specifically targets **Windows** and includes the Turbopack persistent cache fix and the `@next/swc-win32-x64-msvc` SWC binary. It may also work on other platforms, but is only tested on Windows.

---

## Setup

```powershell
# Clone
git clone https://github.com/radioactive4u/Siftly-Grok.git
cd Siftly-Grok

# Install dependencies
npm install

# Generate Prisma client + create SQLite database
npx prisma generate
npx prisma db push

# Start the dev server
npx next dev
```

App runs at **http://localhost:3000**

### Configure Your API Key

1. Open **http://localhost:3000/settings**
2. Paste your xAI API key (`xai-...`) in the **xAI (Grok) / OpenAI** section
3. Select a model (Grok 3 Mini is the default)
4. Click **Test Connection** to verify

Get an xAI API key at: https://console.x.ai

Alternatively, you can use an Anthropic (Claude) key or an OpenAI key — the app supports all three.

---

## Usage

1. **Import bookmarks** — Go to `/import` and follow the 3-step process (uses a bookmarklet or console script to export from X)
2. **Run AI pipeline** — Go to `/categorize` to auto-categorize your bookmarks with Grok
3. **Browse** — `/bookmarks` to filter and search
4. **AI Search** — `/ai-search` for natural language queries
5. **Mind Map** — `/mindmap` for a visual graph of your bookmark categories

---

## Troubleshooting

### Server returns 500 on all routes
Delete the `.next` directory and restart:
```powershell
Remove-Item -Recurse -Force .next
npx next dev
```

### Turbopack cache errors
The fix is already baked into `next.config.ts`. If you still see SST write errors, you can also force Webpack:
```powershell
$env:NEXT_FORCE_WEBPACK="1"
npx next dev
```

### Port 3000 already in use
```powershell
npx next dev --port 3001
```

---

## Upstream

Original project: https://github.com/viperrcrypto/Siftly

This fork tracks the `main` branch. To pull upstream changes:
```powershell
git fetch upstream
git merge upstream/main
```

---

## License

MIT — same as upstream.
