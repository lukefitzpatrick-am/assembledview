# Xano to Postgres ETL tail (archived)

Archived in B18 (3 Nov 2026, decision D8) from `scripts/migration/`. These files are audit history. They have no job left (Xano is severed) and nothing imports them. `tsconfig.json` and `knip.json` skip `docs/archive`.

- `recon.ts`: the post-ETL count gate (`npm run db:recon`, removed). It read a `exports/xano/<date>` snapshot, and no new export can exist.
- `shadow-smoke-plans.ts`: the plans "Xano vs Postgres" golden. Both sides read Postgres by the end, so it compared Postgres with itself.
- `_lineItemTransform.ts`, `_etlTables.ts`: helpers only `recon.ts` and the ETL used. `_etlTables.ts` holds the postgres-authoritative table lists (`POSTGRES_AUTHORITATIVE_TABLES`, `POSTGRES_AUTHORITATIVE_RECON_TABLES`).
- `DISPOSITIONS.md`: Luke's anomaly decisions for the ETL (30 Jul 2026).

Their imports (`./_shared`, `@/db`) point at the live tree as it was. The ETL itself (`etl-xano-to-supabase.ts`) was archived earlier under `scripts/_archive/xano/` and deleted in B18; git history keeps it (last present at `c4d15cd1`).

Still in `scripts/migration/`: `_shared.ts`, `_scheduleTransform.ts` (live: `savePlan`, `publishBillingRevision`), `_gen-drizzle-schema.mjs`, `xero-parity.ts`, `run-xero-sync.ts`, `seed-revenue-line-catalog.ts` and the `apply-00xx-*.ts` appliers.
