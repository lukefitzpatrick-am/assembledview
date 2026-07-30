# Module: Shared Core

The server-side data-access + identity layer everything sits on: Xano URL/auth construction, payload normalisation, pagination, Auth0 session + RBAC, caches, formatters, middleware, build config.

## Xano layer

- **`lib/api/xano.ts` (106 importers)** — single choke point: `getXanoBaseUrl`/`xanoUrl` (env fallback chains), `xanoAuthHeader*` (`Bearer $XANO_API_KEY`, server-only), `parseXanoListPayload` (normalises 4+ response shapes; returns `[]` silently on unknown shapes).
- `lib/api/xanoPagination.ts` — `fetchAllXanoPages` (dual pagination styles, dedupe, silently caps at 10,000 rows; `WithCompleteness` variant truncates wrapped envelopes — DI-5).
- `lib/api.ts` (3.9k-line monolith) — ~150 channel CRUD functions; isomorphic: server hits Xano direct, browser rewrites to `/api/*` proxies. **Throws at import server-side** if publisher/client base URLs unset; imported by client components → no Node-only deps allowed.
- Two catch-all proxies (`/api/media_plans/[...path]`, `/api/media-details/[...path]`) gated by `lib/security/proxyAllowlist.ts` (path depth ≤2, numeric second segment, per-path method sets).
- **`DATA_BACKEND=xano|shadow|postgres`** (default `xano`) — Phase 2 cutover switch. Per-domain override via `DATA_BACKEND_<DOMAIN>` (`REFERENCE`, `PUBLISHERS`, `CLIENTS`, `KPI`) falling back to global `DATA_BACKEND`. Reference-table GETs go through `lib/data/readReferenceMediaDetail.ts`; publishers via `lib/data/readPublishers.ts` (wired in `publishersCache` + server `fetchAllPublishers`); clients via `lib/data/readClients.ts` (wired in `clientsCache`, `fetchClientById`, `/api/clients/[id]`, server `getClientInfo`). Clients include social URL + `client_brain` columns (`0004_clients_missing_columns.sql`) — required before any `DATA_BACKEND_CLIENTS=postgres` flip. KPI via `lib/data/readKpi.ts` (wired in `lib/kpi/{campaign,client,publisher}Kpi.ts` GETs, `publisherKpiCache`, `lib/xano/campaignKpi.ts` pacing bulk); KPI writes stay on Xano until T4. Modes: `xano` = Xano only; `shadow` = serve Xano + async Supabase field-level diff (`lib/data/shadowDiff.ts`, tagged `domain=`; KPI money=`cpv` in cents, rates epsilon `1e-6`); `postgres` = serve Supabase via `db/`. Admin summary: `GET /api/admin/migration-diffs` (`requireAdmin`) returns `byDomain` + `byTable`. Anomaly audit trail: `scripts/migration/DISPOSITIONS.md`.
- Xano structure: 13 API groups / ~340 endpoints / 64 tables — machine-readable in root `xano-workspace-spec.json` (OpenAPI), `xano-apigroups-endpoints.json` (incl. per-endpoint auth flags), `xano-tables-schema.json` (full DDL). Host `xg4h-uyzs-dtex.a2.xano.io` appears nowhere in runtime source (verified). Media plans group id `RaUx9FOa`.
- Xano-side function-stack recipes live in `/XANO_SCRIPT_REFERENCE.md` (input{} must declare fields; `client_name` → `mp_client_name`).

### Env vars (traps)

- Alias pairs both live: `XANO_MEDIA_PLANS_BASE_URL` / `XANO_MEDIAPLANS_BASE_URL`. Fallback chain order matters.
- `XANO_BASE_URL` triples as generic fallback AND the assistant endpoint — setting it wrong silently mis-routes clients/media-plans calls.
- `DATA_BACKEND` (`xano` \| `shadow` \| `postgres`, default `xano`) — unknown values fall back to `xano`. Per-domain `DATA_BACKEND_<DOMAIN>` overrides when set. `postgres`/`shadow` need `DATABASE_URL`. Shadow diffs are in-memory per process (not durable across cold starts).
- Missing `XANO_API_KEY` → **no auth header, no error** (only `requireXanoAuthHeaderRecord` throws). `getRequiredEnv` returns `""` in the browser.
- Module-scope throws (boot failures, not 500s): `lib/auth0.ts`, `lib/api/auth0Management.ts`, `lib/api.ts:17-18`, admin users route.
- `http://localhost:3000` fallbacks reachable in prod if `NEXT_PUBLIC_BASE_URL`/`AUTH0_BASE_URL` unset: `internalBaseUrl.ts`, `frameSign.ts`, `lib/utils/auth.ts`, account page.
- Several `XANO_TIMEOUT_MS`-named constants are hardcoded locals, not env reads.
- README's Xano config section is stale (references nonexistent `lib/xano/config.ts` and unused env names).

## Auth (Auth0 v4)

- `lib/auth0.ts` — singleton; throws at import on missing env (app-wide outage). `beforeSessionSaved` persists namespaced custom claims (dual-domain `.com`/`.com.au` + env-overridable).
- `lib/rbac.ts` (53 importers, edge-safe) — roles admin/manager/client; 4-tier resolution (namespaced claim → app_metadata → user_metadata → permission inference); numeric-only client slugs rejected; role-less valid session = authenticated but every requireRole 403s (Auth0 Post-Login Action must be enabled).
- `middleware.ts` — Auth0 session roll → `/api/*` 401 JSON if no session; pages redirect to login; client-role users confined to `/dashboard/{their-slug}`. **Authentication only — tenant isolation is per-handler** (SEC-8). Bypasses: `/auth/*`, `/api/auth/*`, **`/api/cron/*`** (only `assertCronSecret` protects crons), static.
- Gates: `requireAdmin`, `requireFinanceAdmin` (all finance routes), `requireRole(["admin","manager"])`, `checkClientMbaAccess` (13 routes; its exact-equality fallback effectively always denies — SEC-9).
- `lib/auth/getCurrentUser.ts` — audit identity; numeric id is always 0 (no Xano users table); identity lives in `*_name` fields.
- Known: two Auth0 client instances exist (`lib/utils/auth.ts` vs `lib/auth0.ts`) — unresolved which new helpers should use.

## Caching (three mechanisms, all per-lambda unless noted)

1. **Coalesced module TTL caches** — clientsCache (10min, invalidated on client writes), mediaPlanVersionsCache (60s + 30s failure backoff, no invalidation), mediaPlansListCache (60s, none), publishersCache / publisherKpiCache (10min, none), mediaContainerBestPracticeCache (10min), **finance/xanoReferenceCache — a SECOND independent clients cache (30s)**. All serve stale-on-failure.
2. **`unstable_cache`** (survives lambdas): pacingRowsCache (4h, tag `pacing-campaigns` — the repo's only `revalidateTag` caller is orphan-assign), globalSpendCache (300s, tag never revalidated), planning metaCache (never revalidated).
3. **Browser**: `coalescedGetJson` (60s, collapses Strict-Mode double mounts).

Boot warming via `instrumentation.ts` — skipped on Vercel unless `WARM_CACHES_ON_BOOT=true` (deliberate: concurrent cold starts would starve Xano). Background refresh was removed on purpose (serverless suspension caused phantom timeouts) — don't reintroduce fire-and-forget refresh.

## Cross-cutting utils

- `lib/utils.ts` (216 importers) — `cn()`, `theme`, `mediaTypeTheme` (channel colour keys are load-bearing).
- `lib/format/money.ts` (80) — `formatAUD`, `roundMoney2/4`, `parseMoneyInput`. Rounding changes = reconciliation drift everywhere.
- `lib/clients/slug.ts` (24) — slugs ARE tenant identity; `legalsuper → legal_super` override is load-bearing. NOTE: pacing uses a different slugifier (`slugifyPlanClientName`).
- Dates: `lib/dates/parseDateSafe` (LOCAL midnight) vs `parseDateNativeSafe` (UTC midnight) are NOT interchangeable — swapping shifts dates by a day. Three Melbourne-date helper families exist (lib/timezone, lib/dates/melbourne, lib/pacing/maths).
- Duplicate toast hook with separate state: `components/ui/use-toast` (52 importers) vs `hooks/use-toast` (2).
- `tsconfig`: `strict: false` + `strictNullChecks: true`; three perf test files excluded from typecheck.

## Deploy config

`vercel.json` crons: xano-line-item-sync (daily 19:00 UTC), ops-health (22:00), pacing-digest (Mon/Thu 22:30), creative-upload-digest (hourly). `next.config.mjs`: snowflake-sdk externalised, finance redirects, pdfkit fs fallbacks. Regions iad1/syd1/sin1.
