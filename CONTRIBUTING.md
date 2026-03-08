# Contributing to Siftly-Grok

This is a Windows fork of [Siftly](https://github.com/viperrcrypto/Siftly) with xAI/Grok support, X folder sync, and large-library fixes. Contributions that improve the fork are welcome.

## Development Setup

1. Clone the repo
2. Install dependencies: `npm install`
3. Generate Prisma client: `npx prisma generate`
4. Set up the database: `npx prisma db push`
5. Start the dev server: `npm run dev:clean` (clears stale cache first)

Or use the one-command launcher:

```powershell
.\start.ps1
```

### Configure an AI provider

Open **Settings** (`http://localhost:3000/settings`) and add one of:
- **xAI key** (`xai-...`) — for Grok models ([console.x.ai](https://console.x.ai))
- **Anthropic key** (`sk-ant-...`) — for Claude models
- **OpenAI key** (`sk-...`) — for GPT models

## Project Structure

- `app/` — Next.js pages and API routes
- `lib/` — Core logic (AI pipeline, clients, database helpers)
- `components/` — Reusable UI components
- `prisma/` — Database schema
- `cli/` — CLI tool for direct DB access

## Key Files for Common Changes

| Task | File(s) |
|------|---------|
| AI categorization prompts | `lib/categorizer.ts` |
| Default categories | `lib/categorizer.ts` → `DEFAULT_CATEGORIES` |
| Vision analysis prompts | `lib/vision-analyzer.ts` |
| Tool/product detection | `lib/rawjson-extractor.ts` → `KNOWN_TOOL_DOMAINS` |
| xAI/OpenAI client wrapper | `lib/openai-client.ts` |
| AI client resolution | `lib/claude-cli-auth.ts` → `resolveAnyClient()` |
| X folder sync | `app/api/import/folders/route.ts` |
| Pipeline chunking/workers | `app/api/categorize/route.ts` |
| Bookmark import + dedup | `app/api/import/route.ts` |
| Export bookmarklet | `app/import/page.tsx` (embedded scripts) |
| Settings UI + model selector | `app/settings/page.tsx` |

## Making Changes

### Before submitting

```powershell
# Type-check — must pass with zero errors
npx tsc --noEmit

# Test the AI pipeline end-to-end if you touched categorizer/vision code
# Import a small set of bookmarks → run pipeline → verify categories assigned

# Clean start to verify no stale cache issues
npm run dev:clean
```

### Fork-specific considerations

- **Windows compatibility** — test on Windows. Avoid Unix-only paths, shell commands, or macOS keychain assumptions.
- **Multi-provider support** — if you change AI prompt logic, make sure it works with both Anthropic SDK and OpenAI-compatible clients (Grok, OpenAI). The `resolveAnyClient()` function in `lib/claude-cli-auth.ts` handles provider detection.
- **Large libraries** — changes to the pipeline must handle 4,000+ bookmarks. Use chunked processing, respect timeouts, and check `shouldAbort()` for stop button support.
- **Batch operations** — use `findMany` with `{ in: batch }` for dedup/lookups, not sequential `findUnique` in loops.

## Good First Contributions

- Add entries to `KNOWN_TOOL_DOMAINS` in `lib/rawjson-extractor.ts`
- Improve AI prompt accuracy in `lib/categorizer.ts`
- Add new export formats in `lib/exporter.ts`
- Improve mindmap visualization in `components/mindmap/`
- Add keyboard shortcuts
- Improve folder sync error handling / edge cases
- Add tests

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Include a clear description of what changed and why
- Run `npx tsc --noEmit` before submitting
- Test on Windows if possible
- Note which AI provider(s) you tested with

## Reporting Issues

Please open a GitHub issue with:
- Steps to reproduce
- Expected vs actual behavior
- Windows version and Node.js version (`node --version`)
- AI provider and model used
- Any error messages from the browser console or terminal
