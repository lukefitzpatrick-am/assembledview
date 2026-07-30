# `db/` — Supabase schema (migration)

**Source of truth for what is live:** `db/migrations/0001_ported_tables.sql` + `0002_plan_core.sql` (applied via Supabase SQL Editor).

**Drizzle mirror:** `db/schema/*.ts` — generated from those SQL files (`node scripts/migration/_gen-drizzle-schema.mjs`), then hand-kept in sync.

**Drizzle kit output:** `db/drizzle/` — baseline snapshot only. The `0000_*.sql` file mirrors the live schema for `drizzle-kit generate` bookkeeping. **Do not `db:migrate` it against Supabase** — tables already exist. Seed `drizzle.__drizzle_migrations` (or use `drizzle-kit pull --init`) before relying on migrate for *future* changes.

**App usage:** reference + publishers + clients reads (`lib/data/read*.ts`) when `DATA_BACKEND` / `DATA_BACKEND_<DOMAIN>` is `shadow` or `postgres`. Expand per Phase 2 domain.

## Env

| Var | Use |
|-----|-----|
| `DATABASE_URL` | Runtime pooler (port **6543**) — `db/index.ts` |
| `DIRECT_URL` | drizzle-kit migrations / introspect (port **5432**) |
| `DATA_BACKEND` | `xano` (default) \| `shadow` \| `postgres` — see `lib/data/backend.ts` |
| `DATA_BACKEND_REFERENCE` / `DATA_BACKEND_PUBLISHERS` / `DATA_BACKEND_CLIENTS` | Optional per-domain override of `DATA_BACKEND` |

## Scripts

- `npm run db:generate` — must be empty when schema matches baseline
- `npm run db:migrate` — future only (after journal baseline)
- `npm run db:studio`
- `npm run test:line-item-attrs`
- `npm run test:shadow-diff`

## Naming deviations (ETL)

- Xano `finance_saved_views.user` → Postgres `user_id`
- Xano `clientdashboard.Client_dashboard` → Postgres `client_dashboard` (unquoted identifier fold)
