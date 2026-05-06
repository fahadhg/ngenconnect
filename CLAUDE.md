# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start dev server at localhost:3000
npm run build    # production build (also runs tsc)
npx tsc --noEmit # type-check only
npx vercel --prod # deploy to Vercel production
```

There are no tests or linting scripts configured.

## Project Overview

NGen Connect is a Next.js 15 (App Router) manufacturing matchmaker for the Canadian Industry 4.0 ecosystem. Users describe what they need in natural language; the app returns 3–5 company matches with a detailed AI-written analysis grounded exclusively in a scraped company database.

**Live URL:** https://ngen-connect-web.vercel.app  
**Vercel project:** `fahads-projects-00b97581/ngen-connect-web`

## Architecture

### Data flow per search

1. User query → `POST /api/search` → Gemini embeds query (`gemini-embedding-001`, 768 dims) → cosine similarity against all pre-embedded companies in `data/companies.json` → returns top 5
2. Top 5 companies → `POST /api/chat` → injected as context into LLM prompt → LLM writes analysis referencing only the provided company data
3. Both responses returned to frontend; token counts + cost are included in both API responses

This is pure RAG — the LLM never draws on training knowledge for company information. The system prompt forbids inventing companies or capabilities.

### Key files

| File | Purpose |
|------|---------|
| `data/companies.json` | Pre-computed embeddings + metadata for ~1,000 companies. Generated externally by `ngen_connect_pipeline/step5_export_for_vercel.py`. Never edit manually. |
| `lib/types.ts` | Shared TypeScript interfaces (`CompanyRecord`, `SearchResult`, `FilterOptions`, `CompanyIndex`) |
| `lib/search.ts` | Loads `companies.json` into memory (cached), runs cosine similarity, applies filters, returns `SearchResult[]` |
| `lib/filterMap.ts` | Hardcoded `SECTOR_FILTER_MAP` (27 sectors) and `CAPABILITY_FILTER_MAP` (35 capabilities). Each maps to relevant capabilities/certifications/materials. Powers the cascading sidebar filters. |
| `app/api/search/route.ts` | POST: embeds query via Gemini, runs `searchCompanies`, returns top 5 + embedding token count + cost. GET: returns filter options for sidebar. |
| `app/api/chat/route.ts` | POST: selects best available LLM, builds prompt with company context, returns summary + input/output token counts + cost. |
| `app/page.tsx` | Entire frontend: chat UI, left filter sidebar, right usage stats panel. All UI components are co-located in this file. |

### LLM selection (chat API)

Priority order — first key found in env wins:
1. `ANTHROPIC_API_KEY` → Claude Sonnet 4.6
2. `OPENAI_API_KEY` → GPT-4.1, then GPT-4.1 Mini
3. `DEEPSEEK_API_KEY` → DeepSeek V3
4. `GEMINI_API_KEY` → Gemini 2.5 Flash

`GEMINI_API_KEY` is always required (search embeddings). All others are optional fallbacks for chat.

### Cascading filters (lib/filterMap.ts)

Selecting a sector narrows Capabilities, Certifications, and Materials to a hardcoded relevant subset (union if multiple sectors). Selecting a capability further narrows Certifications and Materials. Stale selections are auto-cleared. Province and Company Size are never narrowed.

To add a new sector mapping, add an entry to `SECTOR_FILTER_MAP`. To add a new capability mapping, add to `CAPABILITY_FILTER_MAP`. All string values must exactly match what appears in `data/companies.json` filter_options.

### Usage / cost tracking

Both API routes return token counts and cost estimates. `app/page.tsx` accumulates these in `usageStats` state (resets on page refresh). The right sidebar ("Usage" button in header) displays session totals, per-request breakdown, and a pricing reference table.

Approximate model pricing (per 1M tokens) is hardcoded in `app/api/chat/route.ts` (`MODEL_PRICING`) and displayed in the panel in `app/page.tsx` (`PRICING_TABLE`).

## Environment Variables

```
GEMINI_API_KEY=        # required — search embeddings
ANTHROPIC_API_KEY=     # optional — Claude Sonnet 4.6 (first priority for chat)
OPENAI_API_KEY=        # optional — GPT-4.1 / GPT-4.1 Mini
DEEPSEEK_API_KEY=      # optional — DeepSeek V3
```

Set via `npx vercel env add <KEY> production` for deployed environment.

## Important Context

- **Internal preview only** — not for external circulation. Running on personal API keys; usage should be kept light.
- `data/companies.json` is gitignored (large binary). It must be regenerated from the scraping pipeline if missing.
- The working directory has been `/Users/Fahad.Hafeez/Documents/ngen-connect-web` (moved from Downloads due to macOS sandbox restrictions).
- No GitHub remote is configured. Deployments go directly via `npx vercel --prod`.
