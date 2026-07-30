# Supabase migration — master handoff

**Date:** 2026-07-30 · **Status: Active — single source of truth for the migration from here** · Supersedes day-to-day status in the kickoff pack (which remains the reference for the target schema and original prompts).

---

## 1. Why we're doing this (one paragraph)

The 2026-07-30 backend platform review concluded Xano is the wrong platform to continue on: the app's logic lives in Next.js, Xano was serving as a ~A$340–380/mo CRUD layer over 28.5k records, and July's incidents (save outage, PENFOLD016 4× duplication, BOSS006 empty publish, double-count sweep) all traced to the same enabling conditions — no transactions across the 20-channel-table save, no DB-enforced uniqueness/FKs, no staging, JSON schedule blobs. Decision: migrate the data layer to **Supabase Postgres (Sydney) + Drizzle**, consolidating the model during migration (20 channel tables → `line_items`; blobs → `schedule_months`). Full reasoning: `av-review/backend-platform-review-and-migration-recommendation-2026-07-30.md` + the Word report delivered same day.

## 2. Approach principles (unchanged)

1. **Xano remains system of record** until explicit cutover; Supabase is rebuilt from it at will (truncate-and-reload ETL, idempotent).
2. **Every step gated by recon**: counts 100%, money ≤ $0.01/MBA, anomalies dispositioned in CSVs — never silently absorbed.
3. **Frozen contracts**: `bursts_json` shape, `line_item_id` format, Snowflake `XANO_LINE_ITEMS_SNAPSHOT`, PacingStatus ladder. Change nothing cross-system until after cutover.
4. **`DATA_BACKEND=xano|shadow|postgres`** env switch per domain behind the existing choke points; default `xano` so merged code is inert.
5. **Security posture**: all Supabase tables have RLS enabled with no policies → anon/REST keys are dead; the app uses server-side Drizzle over the pooled connection (`DATABASE_URL`, port 6543) which bypasses RLS as table owner; `DIRECT_URL` (5432) only for drizzle-kit.
6. **Money is integer cents** in all new tables; parsing reuses the app's own `lib/**` schedule parsers.

## 3. REVISED rollout strategy (Luke's call, 2026-07-30 evening)

**Build the entire implementation out on `localhost` first; nothing merges/cherry-picks to `main` until the build-out is complete.** Production deployment (Pro upgrade, Vercel envs, prod shadow soak, domain flips) happens as a deliberate later campaign, not incrementally.

Guardrails that make this safe (learned from July, when fixes stranded on localhost while production corrupted):
- All migration code must stay **inert by default** (`DATA_BACKEND` defaults to `xano`; new routes/tools behind admin gates). A hotfix cherry-picked to `main` must never depend on migration commits.
- Keep migration commits **cleanly separated** from any production hotfix commits so the eventual cherry-pick set is a contiguous, reviewable list. Maintain that list in §7.
- Production Xano incidents still get fixed on the old path and cherry-picked as today — the migration doesn't pause ops.

## 4. State as of this handoff — DONE

| Commit (localhost) | What |
|---|---|
| `4252f4e3` | Prompt 1 — `scripts/migration/export-xano.ts`, `npm run xano:export` (66 tables JSONL + manifest + XanoScript logic export) |
| `270ba7b8` | Prompt 2 — Drizzle schema `db/schema/*` (45 tables, matches live DB, empty-diff gate passed), `db/index.ts`, drizzle.config, `db:generate/migrate/studio`, per-channel `attrs` zod validators + golden test |
| `235ac76a` | Prompt 3 — ETL (`db:etl`, truncate-and-reload, --dry-run) + recon gate (`db:recon`); helpers reuse billing/finance parsers |
| `b77d7f52` | Prompt 4 — `DATA_BACKEND` switch, shadow-read for reference tables (`lib/data/backend.ts`, `readReferenceMediaDetail.ts`, `shadowDiff.ts`), `/api/admin/migration-diffs`, 6/6 tests |
| T2a | `getDataBackendFor(domain)` + `DATA_BACKEND_<DOMAIN>`; shadow-read publishers + clients (`readPublishers.ts`, `readClients.ts`); wired via publishersCache / clientsCache / fetchClientById / lib/api.ts; migration-diffs `byDomain` |

Infra: Supabase project `slpdibnxtpdlttbbczvg` (Sydney, **Free plan** — upgrade to Pro before any production traffic), schema applied via `db/migrations/0001/0002.sql`, **fully loaded and reconciled**: 13,305 line_items / 1,013 versions / 48,026 schedule_months; 0 count mismatches; 0 money deltas >$0.01. $3.79M duplicated budget excluded (270 groups, logged). `.env.local` has `DATABASE_URL`, `DIRECT_URL`, `DATA_BACKEND=shadow` (local diffs collecting). Xero sync XanoScript fully read → rebuild spec: `av-review/xero-sync-rebuild-spec-2026-07-30.md` (~90% conf, 2–4 days).

Gate review: `av-review/supabase-phase1-gate-review-2026-07-30.md`. Disposition audit trail: `scripts/migration/DISPOSITIONS.md`. T1 closed 2026-07-30: (A) version=0 mba+mp fallback + transitive versionRemap FIX; (B) curatif002/malay001 `{}` delivery ACCEPT no-delivery; (C) jayco016 ACCEPT as-is (Luke — no Xano repair); (D) synthesized 189th master = **test123001** (orphan version 128).

Phase 0 stragglers still open: provision Xano **Database Connector** read-only (backup path); check workspace settings for the legacy-JSONB "standard SQL columns" banner (closes an ~85% assumption; does not block anything now that the Metadata-API ETL works).

## 5. NET-NEW WORK (the build-out backlog, in dependency order)

### T1 — Close disposition items — DONE 2026-07-30
See `scripts/migration/DISPOSITIONS.md`. jayco016 left ACCEPT (no Xano repair). Re-export + ETL + recon green.

### T2 — Shadow/read build-out for remaining domains (extends Prompt 4 pattern)
One PR per domain behind the same choke points, each with shadow-diff + tests, in this order: **publishers/clients → KPI (campaign/client/publisher) → finance reads → pacing reads → media-plan reads** (loaders for create/edit + dashboards). Note for plans domain: reads must reassemble the app's expected per-channel shapes from `line_items` (channel filter + attrs spread + bursts verbatim) — golden-test against Xano responses in shadow mode. Local `DATA_BACKEND=shadow` accumulates evidence while building; flips to `postgres` happen locally per domain when diffs run clean.

### T3 — AVA read access to Supabase (NEW requirement)
Give AVA (lib/ava tools registry) direct read access to the consolidated model — this is where the new schema pays off for AVA: one `line_items` table + `schedule_months` is vastly easier to query than 20 tables + blobs.
- **Create a dedicated Postgres role** `ava_readonly`: `LOGIN`, `GRANT SELECT` on an explicit table allowlist (plans family, KPI, publishers, clients minus billing-contact columns if desired via a view; EXCLUDE finance_* and xero_* initially — extend deliberately later), `ALTER ROLE ... SET statement_timeout = '5s'`, and RLS SELECT policies for that role on the allowed tables (RLS stays on; the role is not owner so policies are required — one permissive `FOR SELECT TO ava_readonly USING (true)` per allowed table).
- New env `AVA_DATABASE_URL` (pooled, 6543, ava_readonly credentials). NEVER the owner/`postgres` connection.
- New AVA tool(s) in the registry: prefer a small set of **typed query functions** (Drizzle, parameterised) over free-form SQL — e.g. `getCampaignLines(mba)`, `getScheduleMonths(mba, fy)`, `searchLineItems(filters)`. If a free-form SQL tool is wanted later, it runs as `ava_readonly` with the timeout and a row cap, and is admin-flagged.
- Tests in `test:ava-tools` pattern; tool responses capped in size.

### T4 — Save + draft rebuild on the new model (Phase 3 pulled forward; NEW requirement)
Rebuilding save/draft on the old 20-endpoint model is wasted work — agreed. Build it on Postgres:
- **One transactional save**: version row + all `line_items` + `schedule_months` (+ `mba_fee_snapshots` on approval, `billing_overrides` reconciliation) commit or roll back together. A forced mid-save failure must leave zero partial state (test this explicitly — it's the PENFOLD016/BOSS006 kill shot).
- **Draft semantics**: a draft is a version row with `campaign_status='draft'` updated **in place** (replace-set inside the txn); `UNIQUE(version_id, line_item_id)` + stable line ids (generated once at line creation, never restamped from array index) make repeat saves idempotent. Approve/publish = status change + `media_plan_masters.published_version_id` pointer move in the same txn, **gated on line count > 0** (SQL check in the txn — BOSS006 class dies here).
- **Server-computed schedules**: `schedule_months` written server-side from bursts + fee rules (reuse `computeBurstAmounts` / recompute authority); `legacy_schedules` blob kept in sync ONLY as a mirror for not-yet-migrated readers.
- **Xano write-back mirror (transition only)**: after the Postgres txn commits, best-effort write-back to Xano (the old fan-out, demoted to a mirror) so pacing/finance/Snowflake paths still reading Xano stay consistent during the build-out. Write-back failures LOG + banner, never corrupt (Postgres is already committed and is the retry source). This inverts today's risk: the fragile path becomes non-authoritative. Snowflake line-items snapshot keeps working off Xano until repointed (small task inside T2-pacing or T5).
- Fee snapshots + billing_overrides start populating here (closes the two 0-row tables).

### T5 — Xero sync rebuild (spec ready)
Per `av-review/xero-sync-rebuild-spec-2026-07-30.md`: `app/api/cron/xero-sync/route.ts` (daily, CRON_SECRET), matcher lib, alias map → `xero_client_aliases` table, PDFs → Vercel Blob, dual-run parity week vs the Xano task before disabling it. Needs `XERO_CLIENT_ID/SECRET` copied from Xano env settings. Decide: add contacts-refresh stage (recommended).

### T6 — Deployment campaign (only after build-out complete)
Pre-deploy checklist: Supabase **Free → Pro** (+ decide PITR US$100/mo); `DATABASE_URL` + `DATA_BACKEND` into Vercel; assemble the cherry-pick set from §7's commit list; deploy with `DATA_BACKEND=shadow` in prod → soak → flip domains `postgres` in the same order as T2; write-side flip last with the write-back mirror still on; then disable mirror, repoint Snowflake snapshot, disable Xano Xero task.

### T7 — Decommission (unchanged from the plan)
Freeze Xano writes → final export archive → cancel after 30 days. Confirm actual Xano invoice owner first (billing sits on another account). Audit for anything external reading Xano-hosted PDF URLs.

## 6. Open decisions (Luke)
1. jayco016 repair timing (blocks trusting finance data). 2. AVA table allowlist — include finance tables or not at first (recommend: not). 3. PITR add-on at Pro upgrade. 4. Xero contacts-refresh stage (recommend yes). 5. Whether the Xano write-back mirror also covers `media_plan_production` (recommend: yes until finance reads flip).

## 7. Cherry-pick ledger (append every migration commit here)
`4252f4e3` → `270ba7b8` → `235ac76a` → `b77d7f52` → T1 disposition close (`5681a493`) → T2a publishers/clients shadow → (record SHA with `git log --grep=T2a -1`; keep hotfixes out of this chain)

## 8. Key references
- Kickoff pack (schema Part B + original prompts + addendum): `docs/superpowers/supabase-migration-kickoff-pack-2026-07-30.md`
- Gate review: `av-review/supabase-phase1-gate-review-2026-07-30.md` · Xero spec: `av-review/xero-sync-rebuild-spec-2026-07-30.md` · Phase 0 log: `av-review/supabase-phase0-progress-2026-07-30.md` · Platform review: `av-review/backend-platform-review-and-migration-recommendation-2026-07-30.md`
- Envs: `DATABASE_URL` (pooled 6543) · `DIRECT_URL` (5432, drizzle-kit only) · `DATA_BACKEND` · future: `AVA_DATABASE_URL`, `XERO_CLIENT_ID/SECRET`
- Supabase: org AssembledView (Free), project `slpdibnxtpdlttbbczvg`, ap-southeast-2. Claude's Supabase MCP connector attaches in NEW sessions (added mid-session here, never loaded) — next session can run SQL directly instead of via browser.
