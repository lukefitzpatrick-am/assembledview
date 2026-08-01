# `db/` — Supabase schema (migration)

**Source of truth for what is live:** `db/migrations/0001_ported_tables.sql` + `0002_plan_core.sql` + `0003_ava_readonly.sql` + `0004_clients_missing_columns.sql` + `0005_finance_billing_amount_hash.sql` + `0006_xero_client_aliases.sql` + `0007_mba_line_approvals.sql` + `0008_approved_slice_adserving.sql` + `0009_snapshot_checksum.sql` + `0010_finance_periods.sql` + `0011_xero_invoice_matches.sql` + `0012_plan_working_drafts.sql` + `0013_codex_v2.sql` (apply via Supabase SQL Editor; do not `db:migrate` the drizzle baseline). Codex tables live in `db/schema/codex.ts` and are excluded from ETL truncate-reload.

**Drizzle mirror:** `db/schema/*.ts` — generated from those SQL files (`node scripts/migration/_gen-drizzle-schema.mjs`), then hand-kept in sync.

**Drizzle kit output:** `db/drizzle/` — baseline snapshot only. The `0000_*.sql` file mirrors the live schema for `drizzle-kit generate` bookkeeping. **Do not `db:migrate` it against Supabase** — tables already exist. Seed `drizzle.__drizzle_migrations` (or use `drizzle-kit pull --init`) before relying on migrate for *future* changes.

**App usage:** reference + publishers + clients + kpi reads (`lib/data/read*.ts`) when `DATA_BACKEND` / `DATA_BACKEND_<DOMAIN>` is `shadow` or `postgres`. Expand per Phase 2 domain.

## Env

| Var | Use |
|-----|-----|
| `DATABASE_URL` | Runtime pooler (port **6543**) — `db/index.ts` (app/owner path) |
| `DIRECT_URL` | drizzle-kit migrations / introspect (port **5432**) |
| `AVA_DATABASE_URL` | AVA-only pooler (port **6543**) as role `ava_readonly` — **never** postgres/owner |
| `DATA_BACKEND` | `xano` (default) \| `shadow` \| `postgres` — see `lib/data/backend.ts` |
| `DATA_BACKEND_REFERENCE` / `DATA_BACKEND_PUBLISHERS` / `DATA_BACKEND_CLIENTS` / `DATA_BACKEND_KPI` / `DATA_BACKEND_FINANCE` / `DATA_BACKEND_PACING` / `DATA_BACKEND_PLANS` / `DATA_BACKEND_APPROVALS` | Optional per-domain override of `DATA_BACKEND` |

## `ava_readonly` role (0003)

Apply `db/migrations/0003_ava_readonly.sql` via SQL Editor, then set the real password (the migration uses placeholder `<SET_IN_DASHBOARD>` only on first create and does not reset it on re-run):

```sql
ALTER ROLE ava_readonly PASSWORD '<new-secret>';
```

Wire `AVA_DATABASE_URL` to the **transaction pooler** host with that password. Rotate by re-running `ALTER ROLE` and updating `AVA_DATABASE_URL` in Vercel + `.env.local` together. SELECT grants are an explicit table list — adding a table for AVA requires a new migration that `GRANT SELECT` + `CREATE POLICY ava_read` (future tables stay excluded by default).

## Scripts

- `npm run db:generate` — must be empty when schema matches baseline
- `npm run db:migrate` — future only (after journal baseline)
- `npm run db:studio`
- `npm run db:etl` / `npm run db:recon` — use server-only test-shims (same as `test:save-plan`); `mba_line_approvals` is postgres-authoritative and skipped by ETL truncate-reload
- `npm run test:line-item-attrs`
- `npm run test:shadow-diff`
- `npm run test:approvals`

## Naming deviations (ETL)

- Xano `finance_saved_views.user` → Postgres `user_id`
- Xano `clientdashboard.Client_dashboard` → Postgres `client_dashboard` (unquoted identifier fold)
