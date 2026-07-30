# `db/` — Supabase schema (Phase 0/1)

**Source of truth for what is live:** `db/migrations/0001_ported_tables.sql` + `0002_plan_core.sql` (applied via Supabase SQL Editor).

**Drizzle mirror:** `db/schema/*.ts` — generated from those SQL files (`node scripts/migration/_gen-drizzle-schema.mjs`), then hand-kept in sync.

**Drizzle kit output:** `db/drizzle/` — baseline snapshot only. The `0000_*.sql` file mirrors the live schema for `drizzle-kit generate` bookkeeping. **Do not `db:migrate` it against Supabase** — tables already exist. Seed `drizzle.__drizzle_migrations` (or use `drizzle-kit pull --init`) before relying on migrate for *future* changes.

## Env

| Var | Use |
|-----|-----|
| `DATABASE_URL` | Runtime pooler (port **6543**) — `db/index.ts` |
| `DIRECT_URL` | drizzle-kit migrations / introspect (port **5432**) |

## Scripts

- `npm run db:generate` — must be empty when schema matches baseline
- `npm run db:migrate` — future only (after journal baseline)
- `npm run db:studio`
- `npm run test:line-item-attrs`

## Naming deviations (ETL)

- Xano `finance_saved_views.user` → Postgres `user_id`
- Xano `clientdashboard.Client_dashboard` → Postgres `client_dashboard` (unquoted identifier fold)
