# Module: AVA (AI Assistant)

In-product Claude agent mounted as a floating chat widget on every page. Reads a `PageContext` snapshot published through a window-global bridge, calls 28 server-side tools, can write back into the page (form patches, line-item loads) and generate downloadable artefacts. Claude-only; admin-only.

## Key files

- `app/api/chat-v2/route.ts` — the ONLY chat endpoint. Session → admin gate → `AVA_ENGINE=off` kill switch → `ANTHROPIC_API_KEY` check → system prompt + tool context → `runAvaAgent`. `maxDuration=60`, non-streaming. Holds `AVA_V2_APPENDIX` (per-tool usage catalogue).
- `lib/ava/agentLoop.ts` — tool-use loop; wraps tool throws as failures (never crashes a turn); optional Anthropic server web search (max 3 uses); `AVA_MAX_TOOL_ITERATIONS = 8`.
- `lib/ava/anthropic.ts` — singleton client + `AVA_MODEL` (`ANTHROPIC_MODEL` env). **Shared with non-AVA features**: ad-copy, search-copy, researchClient.
- Artefacts: MI workbook, naming workbook, performance report. Issued `generate_performance_report` also fail-soft-persists discrete insights (`keyInsight`, `insights[3]`, recs) into `campaign_insights` via `lib/reports/persistPerformanceReportInsights.ts` — `execSummary` is not a row; `client_id` is resolved from `media_plan_masters` by MBA (tool scope has mba only). Staff read/write the library at `/insights` + embedded `RecentInsightsPanel` / `QuickAddInsightForm` (`GET|POST /api/insights`, `PATCH /api/insights/[id]`, admin-gated). Human create/edit/supersede lives in `lib/insights/writeCampaignInsights.ts` — never delete; edit-in-place only for own rows within 24h, else supersede with both `superseded_by`+`superseded_at` in one txn; cycle walk refuses A→B→A; foreign supersedes stamp `confidence` attribution. AVA reads live priors via `get_client_insights` / `get_campaign_insights` (ava_readonly GRANT in 0022) before rationale/commentary/report; `generate_performance_report` rejects unattributed near-verbatim restatement (`unattributed_prior_insight`, same JSON shape as `invented_money_figure`). Deck numeric fields stay snapshot-only.
- `lib/assistantBridge.ts` — the client↔AVA seam: `window.__AV_ASSISTANT__` `{summary, actions, pageContext}`; typed action handlers; `ava:open-chat` CustomEvent. 12 provider call sites; breakage is silent (window global).
- `lib/ava/buildAvaSystemPrompt.ts` — truncating PageContext serialiser (6,000 chars, depth 6).
- `components/ChatWidget.tsx` (~1k lines) — the UI; also POSTs xlsx to `/api/processPlan` (plan autopopulate).
- `lib/ava/skills/registry.ts` + `skills/content/**` — vendored Assembled skill markdown, read from disk via `process.cwd()` at request time (bundling/tracing changes break at runtime only). 24k-char injection budget; marketing-brain decision-rules auto-chained.
- `lib/ava/autopopulate/**` — media-owner xlsx → plan parse (exceljs + Claude mapping) with in-memory rate limit.
- `src/ava/{systemPrompt,voiceSpec,modes}.ts` — identity/boundaries/voice primitives (historical `src/` location, same `@/` alias).

## Depends on

Nearly everything (read tools): media-containers API, pacing caches + maths, delivery snapshot, finance xanoReferenceCache, clients cache, naming templates/compose, creative assets (PG via `xanoCreativeAssets`), planning audiences (PG via `xanoPlanningAudiences`) + meta, specs, RBAC. Campaign summary helpers in `lib/xano/ava.ts` read masters/versions from Postgres. `save_client_brain` writes via `updateClientPostgresFirst` (Xano mirror best-effort). Postgres plan/finance/xero reads go through `db/avaClient.ts` (`AVA_DATABASE_URL` only) when configured.

## Consumed by

`lib/ava/types.ts` (`PageContext`, `FormPatch`) is imported by 13+ files OUTSIDE AVA — trafficking, creative, dashboards, finance overview panel, planning, both mega-pages. Changing `PageContext` touches most page shells.

## Gotchas

- `attachments`/`questions` are display-only — never round-trip into Anthropic message history (corrupts turns).
- `deriveAvaIdentifiers` regex-parses the route string for slug/MBA — adding a reserved first segment under `/dashboard/*` mis-derives clientSlug.
- `lib/avaSnowflake.ts` is dead (zero importers). `lib/codex/**` is the Tasks domain, not AVA.
- Rate limiters are in-process Maps — per-instance only on serverless.
- Skill markdown edits: content lives in-repo (`lib/ava/skills/content/`), vendored from the Assembled skills — keep in sync deliberately, not ad hoc.
- Postgres reads for AVA use `AVA_DATABASE_URL` as role `ava_readonly` (`db/migrations/0003_ava_readonly.sql`: explicit SELECT allowlist + `ava_read` RLS policies, `statement_timeout=5s`, `default_transaction_read_only=on`). Never the owner/`DATABASE_URL` connection.
- **`client_notes` stays on the AVA allowlist (Q22)** — deliberate; Stage 3 populated notes are chat-queryable. New Codex tables from 0013 are not granted to AVA. See `docs/brain/modules/codex.md`.
- AVA tool `fy` is the Australian FY **ending** year via shared `lib/ava/tools/fyToRange.ts` (`fy=2026` → Jul 2025–Jun 2026). Distinct from finance hub `fyMonthRange` (start-year). Responses that apply an fy filter echo `range` (e.g. `"2025-07..2026-06"`).
