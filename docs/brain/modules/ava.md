# Module: AVA (AI Assistant)

In-product Claude agent mounted as a floating chat widget on every page. Reads a `PageContext` snapshot published through a window-global bridge, calls 26 server-side tools, can write back into the page (form patches, line-item loads) and generate downloadable artefacts. Claude-only; admin-only.

## Key files

- `app/api/chat-v2/route.ts` — the ONLY chat endpoint. Session → admin gate → `AVA_ENGINE=off` kill switch → `ANTHROPIC_API_KEY` check → system prompt + tool context → `runAvaAgent`. `maxDuration=60`, non-streaming. Holds `AVA_V2_APPENDIX` (per-tool usage catalogue).
- `lib/ava/agentLoop.ts` — tool-use loop; wraps tool throws as failures (never crashes a turn); optional Anthropic server web search (max 3 uses); `AVA_MAX_TOOL_ITERATIONS = 8`.
- `lib/ava/anthropic.ts` — singleton client + `AVA_MODEL` (`ANTHROPIC_MODEL` env). **Shared with non-AVA features**: ad-copy, search-copy, researchClient.
- `lib/ava/tools/registry.ts` — registers 26 tools; **throws at module load** if order/names diverge from `AVA_TOOL_NAMES` in `summaries.ts` → 500s the whole route. Reads: campaign context, media plan summary, client details/brain, pacing snapshot, delivery snapshot, creative assets, naming rules, saved audiences, best practice, methodology, platform specs, plus five Postgres consolidated-model tools (`query_campaign_lines`, `query_schedule_months`, `search_line_items`, `query_finance_summary`, `query_xero_status` via `db/avaClient.ts` + `AVA_DATABASE_URL`). Writes: `applyFormPatch`, `applyParsedPlan`, `adjustLineItems`, `saveClientBrain`. Artefacts: MI workbook, naming workbook, performance report.
- `lib/assistantBridge.ts` — the client↔AVA seam: `window.__AV_ASSISTANT__` `{summary, actions, pageContext}`; typed action handlers; `ava:open-chat` CustomEvent. 12 provider call sites; breakage is silent (window global).
- `lib/ava/buildAvaSystemPrompt.ts` — truncating PageContext serialiser (6,000 chars, depth 6).
- `components/ChatWidget.tsx` (~1k lines) — the UI; also POSTs xlsx to `/api/processPlan` (plan autopopulate).
- `lib/ava/skills/registry.ts` + `skills/content/**` — vendored Assembled skill markdown, read from disk via `process.cwd()` at request time (bundling/tracing changes break at runtime only). 24k-char injection budget; marketing-brain decision-rules auto-chained.
- `lib/ava/autopopulate/**` — media-owner xlsx → plan parse (exceljs + Claude mapping) with in-memory rate limit.
- `src/ava/{systemPrompt,voiceSpec,modes}.ts` — identity/boundaries/voice primitives (historical `src/` location, same `@/` alias).

## Depends on

Nearly everything (read tools): media-containers API, pacing caches + maths, delivery snapshot, finance xanoReferenceCache, clients cache, naming templates/compose, creative xano assets, planning meta, specs, RBAC. Postgres plan/finance/xero reads go through `db/avaClient.ts` (`AVA_DATABASE_URL` only) when configured.

## Consumed by

`lib/ava/types.ts` (`PageContext`, `FormPatch`) is imported by 13+ files OUTSIDE AVA — trafficking, creative, dashboards, finance overview panel, planning, both mega-pages. Changing `PageContext` touches most page shells.

## Gotchas

- `attachments`/`questions` are display-only — never round-trip into Anthropic message history (corrupts turns).
- `deriveAvaIdentifiers` regex-parses the route string for slug/MBA — adding a reserved first segment under `/dashboard/*` mis-derives clientSlug.
- `lib/avaSnowflake.ts` is dead (zero importers). `lib/codex/**` is the Tasks domain, not AVA.
- Rate limiters are in-process Maps — per-instance only on serverless.
- Skill markdown edits: content lives in-repo (`lib/ava/skills/content/`), vendored from the Assembled skills — keep in sync deliberately, not ad hoc.
- Postgres reads for AVA use `AVA_DATABASE_URL` as role `ava_readonly` (`db/migrations/0003_ava_readonly.sql`: explicit SELECT allowlist + `ava_read` RLS policies, `statement_timeout=5s`, `default_transaction_read_only=on`). Never the owner/`DATABASE_URL` connection.
