# Stage 2 smoke — Plan C (`feature/billing-plan-c`)

Window-by-window flip order for typed `plan_*_rows` (dual-write → backfill → replace-set → per-surface readers). Branch must be merged with latest `main` before a production window.

## Flags (Stage 2)

| Flag | Values | Default | Effect when off |
|------|--------|---------|-----------------|
| `PLANC_ROWS_DUAL_WRITE` | `off` \| `on` | `off` | No plan_*_rows writes; blobs only |
| `PLANC_REPLACE_SET` | `off` \| `log` \| `on` | `off` | Legacy channel replace; `log` = warn only; `on` = stage→verify→bulk_supersede |
| `PLANC_READ_ROWS_FINANCE` | `off` \| `on` | `off` | Finance hub derives from schedule blobs |
| `PLANC_READ_ROWS_PACING` | `off` \| `on` | `off` | Delivery/expected-spend from schedule blobs |
| `PLANC_READ_ROWS_EXPORT` | `off` \| `on` | `off` | Excel amounts from blob-derived BillingRecords |
| `PLANC_READ_ROWS_DOCS` | `off` \| `on` | `off` | MBA docs from blob parse + blob checksum |

**Always:** `billing_rows_migrated=false` → readers fall back to blobs even if a read flag is on.

Stage 1 flags (`PLANC_SERVER_AUTHORITY`, `PLANC_C1_FULL_SCOPE`, `PLANC_DOCS_FROM_PERSISTED`, `NEXT_PUBLIC_PLANC_DOCS_FROM_PERSISTED`) stay as in [STAGE1-SMOKE.md](./STAGE1-SMOKE.md). Prefer keeping Stage 1 enforce stable before flipping Stage 2 readers.

### Integrity cron choice (S2-P6)

**Extended** nightly `/api/cron/billing-integrity` (no sibling route). Channel duplicate/orphan/version_less scan stays **nightly**. Rows checksum audit (`checksum_drift` + `writer_bypass`) runs **weekly (Monday UTC)** or on demand:

```bash
# Force rows audit any day (cron secret required)
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://<host>/api/cron/billing-integrity?rows_checksum=1"
```

Watch `[billing-integrity]` logs for `"kind":"checksum_drift"` / `"kind":"writer_bypass"`.

---

## Flip order (verify before next step)

### (1) Merge dark — all S2 flags off

1. Merge `feature/billing-plan-c` → deploy Preview/Prod with all Stage 2 flags unset/`off`.
2. Smoke: create → edit → save draft → overwrite → publish on a known MBA.
3. Expect: behaviour identical to pre-merge for money paths (blobs only; no replace-set hard-fail; finance/pacing/export/docs unchanged).
4. Soft paths may still log if Xano tables missing — saves must succeed.

### (2) Dual-write + replace-set log

1. Set `PLANC_ROWS_DUAL_WRITE=on` and `PLANC_REPLACE_SET=log`. **Redeploy.**
2. Save an MBA (and/or PATCH billing-schedule) on a test plan.
3. Watch Runtime Logs for:
   - `[planc-replaceset]` — log-mode replace diagnostics
   - `[planc-rows-missing]` — soft-fail if `plan_*_rows` endpoints absent
4. Expect: blobs still authoritative for reads; rows appear for versions when dual-write succeeds; `snapshot_checksum` stamped when write succeeds.
5. Do **not** proceed if saves fail or rows tables are missing without an agreed soft-fail.

### (3) Backfill dry-run → Luke reviews → apply clean

```bash
npx tsx scripts/backfill-plan-rows.ts --dry-run
# Review backfill-recon.csv (clean / anomaly / known-dup)
npx tsx scripts/backfill-plan-rows.ts --apply   # clean versions only
```

1. Dry-run first; **Luke reviews** recon CSV (parse-failure / amount-mismatch / rounding / structural).
2. `--apply` only for **clean** versions (`billing_rows_migrated` stamped).
3. Spot-check: migrated version has rows + checksum; anomaly versions remain unmigrated (blob fallback).

### (4) Replace-set on

1. Set `PLANC_REPLACE_SET=on`. **Redeploy.**
2. Save with channels enabled/disabled; empty enabled-channel save should wipe live rows via supersede path.
3. Expect: duplicate live lines → 409 when flag on; `[planc-replaceset]` on hard failures.
4. Rollback = flag → `log` or `off` + redeploy (see below).

### (5) Reader flags — one surface per window

Flip **one** read flag at a time. After each flip, spot-check numbers against the blob-path (flag off on a control MBA or compare before/after on the same fixture).

| Order | Flag | Spot-check |
|-------|------|------------|
| 5a | `PLANC_READ_ROWS_FINANCE=on` | Finance hub receivables/payables month totals vs prior blob derive |
| 5b | `PLANC_READ_ROWS_PACING=on` | MBA expected-spend / delivery metrics vs blob delivery schedule |
| 5c | `PLANC_READ_ROWS_EXPORT=on` | Excel export totals (same workbook layout) vs blob-sourced export |
| 5d | `PLANC_READ_ROWS_DOCS=on` | MBA PDF totals + footer matches stored `snapshot_checksum`; client address via `clients_id` / `mp_clients_id` / `client_id` |

Only advance to the next surface after the current window looks clean.

### (6) Rollback per step

1. Set **that step’s flag** back to `off` (or `log` for replace-set).
2. **Redeploy required** (Stage 1 finding): env changes do not mutate an already-serving deployment until Redeploy / new git deploy.
3. No code revert needed for flag-gated Stage 2 money behaviour.
4. Integrity cron remains (ops); turning flags off does not disable the tripwire.

---

## Flag audit vs `origin/main` (paste)

### Commands run

```text
git rev-parse HEAD origin/main
git merge-base HEAD origin/main

rg -n "process\.env\.PLANC_|process\.env\.NEXT_PUBLIC_PLANC_" --glob "*.ts" --glob "*.tsx"

rg -n "resolvePlanC(RowsDualWrite|ReplaceSet|ReadRows|ServerAuthority|DocsFromPersisted|C1FullScope)" \
  --glob "*.ts" --glob "*.tsx" -g "!**/*.test.ts" -g "!**/__tests__/**"

rg -n "PLANC_READ_ROWS_|PLANC_ROWS_DUAL_WRITE|PLANC_REPLACE_SET" \
  --glob "*.ts" --glob "*.tsx" -g "!**/*.test.ts" -g "!**/__tests__/**"

rg -n "billing-integrity|checksum_drift|writer_bypass" vercel.json app/api/cron lib/billing lib/finance/rows
```

### Verify tips at audit time

- `HEAD` / `merge-base` / `origin/main` recorded in the commit window (re-run before Friday if main moved).
- Reader flags are resolved via `lib/finance/rows/readFlags.ts` (`process.env[ENV_KEYS[surface]]`) — may not match a naive `process.env.PLANC_READ_ROWS_*` string grep; include `readFlags.ts` + `resolvePlanCReadRowsMode`.

### `PLANC_*` env reads (flagged behaviour)

| Flag | Read / resolve sites |
|------|----------------------|
| `PLANC_SERVER_AUTHORITY` | `lib/finance/authority/computeAndPersist.ts` → MBA PUT + billing-schedule PATCH |
| `PLANC_C1_FULL_SCOPE` | `lib/finance/c1FullScopeGate.ts` → C1 recompute |
| `PLANC_DOCS_FROM_PERSISTED` | `lib/finance/planCDocsFromPersisted.ts` → MBA generate + mediaplans generate-pdf |
| `NEXT_PUBLIC_PLANC_DOCS_FROM_PERSISTED` | create + MBA edit PDF fetch bodies |
| `PLANC_ROWS_DUAL_WRITE` | `lib/finance/rows/dualWrite.ts` → MBA PUT + billing-schedule PATCH |
| `PLANC_REPLACE_SET` | `lib/mediaplan/replaceSet.ts` → `lib/api/replaceChannelLineItems.ts` + MBA PUT |
| `PLANC_READ_ROWS_FINANCE` | `lib/finance/rows/readFlags.ts` → billing + payables routes attach |
| `PLANC_READ_ROWS_PACING` | `readFlags.ts` → MBA GET delivery hydrate |
| `PLANC_READ_ROWS_EXPORT` | `readFlags.ts` → `composeBillingRecordsForExportMonth` |
| `PLANC_READ_ROWS_DOCS` | `readFlags.ts` → MBA generate hydrate + client-id prefer |

When all Stage 2 flags are off: dual-write no-ops; replace-set uses legacy path; readers use blobs.

### Unconditional behaviour changes vs main (Stage 2 scope)

| Change | Flagged? | Notes |
|--------|----------|-------|
| Schema specs (`XANO-STAGE2-SCHEMA.md`), `line_uid` helpers, row types | **N/A (inert)** | Specs/types only — no runtime money path |
| `scripts/backfill-plan-rows.ts` | **N/A (inert)** | Manual CLI — not invoked by the app |
| `/api/cron/billing-integrity` rows audit (`checksum_drift`, `writer_bypass`) | **No (ops)** | Weekly/on-demand read-only tripwire — same class as S0 channel integrity cron |
| Auth on document routes (S0/S1) | **No** | Intentional product gate — not Stage 2 |

**Expected unconditional money-path additions: none.** Schema specs and scripts are inert; integrity cron is ops/read-only.

### Log prefixes (Stage 2)

| Prefix | Meaning |
|--------|---------|
| `[planc-rows-missing]` | Dual-write / row fetch soft-fail (tables/endpoints missing) |
| `[planc-replaceset]` | Replace-set log/on diagnostics |
| `[planc-idempotency]` | Duplicate save idempotency |
| `[billing-integrity]` | Channel + weekly rows checksum findings |

### Verify (this commit)

- `npm run typecheck` / `npx tsc --noEmit` — clean
- `npx vitest run` — green (includes `checksumAudit` + prior Stage 2 suites)
