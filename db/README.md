# `db/` — Supabase schema (migration)

**Source of truth for what is live** (apply via Supabase SQL Editor; do not `db:migrate` the drizzle baseline):

- `0001_ported_tables.sql` … `0013_codex_v2.sql` + `0018_version_publication.sql` + `0018a_version_publication_parity.sql` (pre-overnight baseline)
- `0019_campaign_insights.sql` — campaign insights library table
- `0020_clients_m365_identity.sql` — clients slug + M365 SharePoint/Teams identity columns
- `0021_m365_provisioning_log.sql` — Graph provisioning attempt log
- `0022_campaign_insights_ava_readonly.sql` — GRANT SELECT on campaign_insights to ava_readonly
- `0023_line_item_panels.sql` — OOH panel/pack detail rows
- `0024_publisher_profiles.sql` — ingest publisher mapping config (jsonb rows, not code)
- `0033_publisher_profiles_sen.sql` — seed SEN radio profile (ON CONFLICT publisher_name)
- `0034_publisher_profiles_money_map.sql` — typed money `column_map` targets (QMS/SCA/JCDecaux; not SEN rates)
- `0035_publisher_profiles_reference_ignore.sql` — SCA Market Rate / Market Total / Total Stations / Total Impacts / Client Rate → `reference:ignore`
- `0036_publisher_profiles_publisher_id.sql` — nullable `publisher_id` FK to `publishers.id` + explicit four-row backfill (QMS=30, JCDecaux=35, SCA=12, SEN=19) guarded by `migration_markers`
- `0037_ingest_runs.sql` — per-upload ingest history (Accept / Cancel / blocked); RLS on; no ava_readonly grant
- `0049_publisher_profiles_line_granularity.sql` — `line_granularity` (`per_row` default; `grouped` unused by seeds). AUTHOR ONLY; do not drizzle-kit. JSON seed must agree.
- `0051_finance_billing_records_backfill.sql` — insert app-written Xano `finance_billing_records` missing from Postgres, matched on `invoice_key`, `migration_markers` `0051_finance_billing_records_backfill`. AUTHOR ONLY. Live 1 Sep 2026: 0 missing (the one `media:` row is already in PG). Pre-flight `RAISE EXCEPTION` if any staging key is `xero:`. Do not apply until Luke runs it.
- `0052_xero_billing_amounts_ex_gst.sql` — rewrite `xero:` `finance_billing_records.total` / `billed_amount_cents` from `xero_ar_invoices.sub_total`. AUTHOR ONLY. Live probe 1 Sep 2026: 479 rows, movement -$853,418.25. Do not apply until Luke runs it.
- `0053_client_billing_lifecycle.sql` — add approval + Xero-match stamps on `finance_billing_records` (`approved_at` / `approved_by` / `approved_by_name` / `approved_amount_cents` / `approved_lines_hash` / `matched_xero_invoice_id` / `matched_at` / `matched_by`). Partial index on `approved_at IS NULL` (To bill working set) + index on `matched_xero_invoice_id`. Marker `0053_client_billing_lifecycle`. Pre-flight RAISE NOTICE of row counts by `invoice_key` prefix. AUTHOR ONLY. Does not drop `billed_*`. Does not touch `clients` or `xero_*`. Do not apply until Luke runs it.
- `0054_seed_xero_contact_links.sql` — insert `xero_contact_links` for every `xero_contacts` row whose `normalizeContactKey` name matches exactly one `clients.mp_client_name`. Key = `xero_contact_id`. Marker `0054_seed_xero_contact_links`. Pre-flight RAISE NOTICE of insert count; RAISE EXCEPTION if any contact would map to two clients. AUTHOR ONLY. Do not apply until Luke runs it.
- `0055_line_item_panels_unique.sql` — partial unique index `uq_line_item_panels_line_source` on `(line_item_id, source_row_ref) WHERE source_row_ref IS NOT NULL`. Applied (0 rows at apply). AUTHOR ONLY; do not drizzle-kit.
- `0025_codex_tasks_source_profile.sql` — tasks.source allows `profile:<name>` seed keys
- `0026_enable_rls_public_tables.sql` — enable RLS on migration_markers / campaign_insights / line_item_panels / publisher_profiles + ava_readonly SELECT policy — applied 12 Aug via Supabase MCP, do not re-apply
- `0027_line_item_panel_flights.sql` — per-period panel presence (no money columns)
- `0028_myhours_time.sql` — time_entries + myhours_links + myhours_sync_runs (RLS on; no ava_readonly grant)
- `0029_fireflies_client_notes.sql` — client_notes duration_seconds + transcript_url + is_internal for Fireflies Stage 3
- `0030_ava_proposals_mba.sql` — ava_task_proposals.proposed_mba_number + widen client_notes.matched_by for title/internal
- `0031_myhours_unknown_user_count.sql` — myhours_sync_runs.unknown_user_count (CX2-1 Users join sentinel)
- `0032_ava_time_entry_proposals.sql` — ava_time_entry_proposals for Fireflies → MyHours Confirm path (CX2-6; RLS on; no ava_readonly grant)
- `0039_fireflies_client_first.sql` — `clients.client_name_aliases` + `team_members.email_aliases` (Fireflies CLIENT-first attribution; apply via Supabase SQL Editor)
- `0040_fireflies_auto_create.sql` — `tasks.auto_created` + `tasks.ava_auto_key` (unique-roster Fireflies auto-create; apply via Supabase SQL Editor)
- `0041_publisher_specs.sql` — `publisher_specs` + `spec_runs` (MI specs store + explicit `publishers.id` join seed; RLS on; no ava_readonly grant). Applied (20 rows verified). civic-outdoor / tonic / ten stay `publisher_id` NULL; SCA/SEN stay ingest-only; suffix aliases join Google Ads = 3 and YouTube = 15. Do not dump `mi-library/` into `spec_json`.
- `0042_spec_deadline_overrides.sql` — explicit manual material-deadline overrides (who / when / value). Applied. RLS on; no ava_readonly grant.
- `0043_meeting_attribution_targets.sql` — `client_notes.attributed_type` + `publisher_id`; `publisher_domains`; `meeting_title_rules`. Applied (backfill 51 client / 18 internal / 28 queue; RLS on). Backfill marker `0042_attributed_type_backfill`. No ava_readonly grant. Never seed publisher domains.
- `0044_mi_resolution.sql` — `media_plan_versions.mi_resolution` jsonb (persisted MI interview answers). Applied (column live). No ava_readonly grant. Do not mint 0043 for this.

Codex tables live in `db/schema/codex.ts` and are excluded from ETL truncate-reload. `campaign_insights` lives in `db/schema/insights.ts`; OOH panel/pack detail in `db/schema/panels.ts` (`line_item_panels` + child `line_item_panel_flights`); ingest publisher config in `db/schema/publisherProfiles.ts`.

**Drizzle mirror:** `db/schema/*.ts` — generated from those SQL files (`node scripts/migration/_gen-drizzle-schema.mjs`), then hand-kept in sync. `migration_markers` lives in `db/schema/migrationMarkers.ts`. Tables from 0010 / 0011 / 0012 (`finance_periods`, `finance_run_items`, `app_notifications`, `xero_invoice_matches`, `xero_contact_links`, `xero_match_month_metrics`, `plan_working_drafts`) are now mirrored (`financePeriods.ts`, `xeroMatching.ts`, `planWorkingDrafts.ts`). SQL remains source of truth; existing callers still use raw `sql` templates and were not migrated to the query builder.

**Drizzle kit output:** `db/drizzle/` — frozen generate snapshot, regenerated from current `db/schema/*.ts` as of this commit so `npm run db:generate` is empty when the TypeScript mirrors have not changed. **`db:generate` empty-diff is the gate again.** The `0000_baseline.sql` file is bookkeeping only. **Do not `db:migrate` it against Supabase** — tables already exist. Do not `drizzle-kit pull --init`: kit 0.31 does not list `--init`, and upstream docs say that flag writes `drizzle.__drizzle_migrations` (the live database must not be touched).

**Two complementary checks — neither is the whole story:**

| Command | Proves | Does not cover |
|---|---|---|
| `npm run db:generate` | The `db/drizzle/` snapshot matches `db/schema/*.ts` (kit emit is empty) | Never consults live Postgres. Silent if the mirrors themselves drifted from the database. |
| `npm run db:drift` | The TypeScript mirrors match live public schema (columns, FKs, indexes/uniques by canonical identity) | Not type / nullability / default; not constraint names; not RLS, policies, CHECKs, or opclass. Does not write to Postgres. |

Exclusions on `db:drift` may only cover how an object is **written** (naming, unique-index vs unique-constraint, opclass, parens, casts, RLS, policies, CHECKs). Column order, column direction, and partial predicates are semantics and are always drift. RLS policies, check constraints, and index opclasses live in SQL migrations and are omitted from the TS mirrors on purpose — they will not appear in a generate diff.

**Re-baseline** (schema-side only; never apply SQL):

1. Delete `db/drizzle/` contents.
2. `npx drizzle-kit generate --name baseline --prefix index` (uses `drizzle.config.ts` → `out: ./db/drizzle`).
3. If kit emits a random `0000_*.sql` name, rename it to `0000_baseline.sql` and set `_journal.json` `tag` to `0000_baseline`.
4. Confirm `npm run db:generate` twice is empty.

**App usage:** reference + publishers + clients + kpi reads (`lib/data/read*.ts`) when `DATA_BACKEND` / `DATA_BACKEND_<DOMAIN>` is `shadow` or `postgres`. Expand per Phase 2 domain.

## Backfilling migrations

A migration that backfills existing rows **must** be guarded by a `migration_markers` key (see 0018 / 0018a). Never use `WHERE col IS NULL` alone as the re-run guard — after the feature is live, NULL means a genuine unpublished/unfilled state, and a re-run would corrupt it.

## Env

| Var | Use |
|-----|-----|
| `DATABASE_URL` | Runtime pooler (port **6543**) — `db/index.ts` (app/owner path) |
| `DIRECT_URL` | drizzle-kit migrations / introspect (port **5432**) |
| `AVA_DATABASE_URL` | AVA-only pooler (port **6543**) as role `ava_readonly` — **never** postgres/owner |
| `DATA_BACKEND` | `postgres` (default) \| `shadow` \| `xano` (explicit; warns) — unset/unrecognised → `postgres`. See `lib/data/backend.ts` |
| `WRITE_BACKEND` | `postgres` (default) \| `xano` (explicit; warns) — independent of `DATA_BACKEND` |
| `DATA_BACKEND_REFERENCE` / `DATA_BACKEND_PUBLISHERS` / `DATA_BACKEND_CLIENTS` / `DATA_BACKEND_KPI` / `DATA_BACKEND_FINANCE` / `DATA_BACKEND_PACING` / `DATA_BACKEND_PLANS` / `DATA_BACKEND_APPROVALS` | Optional per-domain override of `DATA_BACKEND`; empty falls through to global, then `postgres` |
| `XANO_MIRROR_ENABLED` | `true` enables T4b plan-save Xano write-back after Postgres commit; default **off** (unset / any other value). Post-cutover MBAs have no Xano master row, so the mirror cannot serve as a rollback target. Independent of `DATA_BACKEND` / `WRITE_BACKEND`. See `isXanoMirrorEnabled` in `lib/data/backend.ts`. |
| `NEXT_PUBLIC_PLAN_DRAFTS` | `on` \| `off` (default **off**). Autosave chrome (3s/15s + soft Save draft). **Off does not delete** `plan_working_drafts` — rows are retained; Stage 2b load offer + save-on-published working draft stay reachable. Local only until Luke sets Vercel at merge. |

## `ava_readonly` role (0003)

Apply `db/migrations/0003_ava_readonly.sql` via SQL Editor, then set the real password (the migration uses placeholder `<SET_IN_DASHBOARD>` only on first create and does not reset it on re-run):

```sql
ALTER ROLE ava_readonly PASSWORD '<new-secret>';
```

Wire `AVA_DATABASE_URL` to the **transaction pooler** host with that password. Rotate by re-running `ALTER ROLE` and updating `AVA_DATABASE_URL` in Vercel + `.env.local` together. SELECT grants are an explicit table list — adding a table for AVA requires a new migration that `GRANT SELECT` + `CREATE POLICY ava_read` (future tables stay excluded by default).

## Scripts

- `npx tsx scripts/migration/apply-0039-fireflies-client-first.ts` — idempotent apply of `0039_fireflies_client_first.sql` (SQL Editor also fine)
- `npx tsx scripts/migration/apply-0041-publisher-specs.ts` — idempotent apply of `0041_publisher_specs.sql` (applied)
- `npx tsx scripts/migration/apply-0055-line-item-panels-unique.ts` — idempotent apply of `0055_line_item_panels_unique.sql` (applied; SQL Editor also fine)
- `npm run db:generate` — must be empty when schema matches the snapshot (does not consult the database)
- `npm run db:drift` — live Postgres vs `db/schema/*.ts`; must be clean (exit 0). Read-only; never writes
- `npm run db:migrate` — future only (after journal baseline)
- `npm run db:studio`
- `npm run db:etl` / `npm run db:recon` — use server-only test-shims (same as `test:save-plan`); `mba_line_approvals` is postgres-authoritative and skipped by ETL truncate-reload
- `npm run test:line-item-attrs`
- `npm run test:shadow-diff`
- `npm run test:approvals`

## Naming deviations (ETL)

- Xano `finance_saved_views.user` → Postgres `user_id`
- Xano `clientdashboard.Client_dashboard` → Postgres `client_dashboard` (unquoted identifier fold)
