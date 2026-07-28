# Stage 1 smoke — Plan C (`feature/billing-plan-c`)

Manual smoke script for the Friday window. Branch is merged with latest `main` (merge-base = `origin/main` tip at verification time).

## Flags (defaults = off / identical to main for S1 money behaviour)

| Flag | Values | Default | Effect when off |
|------|--------|---------|-----------------|
| `PLANC_SERVER_AUTHORITY` | `off` \| `log` \| `enforce` | `off` | Persist client billing shape after C1 (byte-identical path) |
| `PLANC_C1_FULL_SCOPE` | `off` \| `log` \| `enforce` | `off` | Classic media+fee C1 only |
| `PLANC_DOCS_FROM_PERSISTED` | `off` \| `on` | `off` | MBA/Excel routes accept legacy client totals |
| `NEXT_PUBLIC_PLANC_DOCS_FROM_PERSISTED` | `off` \| `on` | unset/`off` | Create/edit still POST full MBA body |

Set matching pairs in Vercel **Preview** (dev) and **Production** when flipping.

---

## (a) Flags all off — parity with main

1. Ensure all `PLANC_*` / `NEXT_PUBLIC_PLANC_DOCS_FROM_PERSISTED` are unset or `off`.
2. On a **dev** MBA: create → edit channels → save draft → overwrite draft → publish/approve → export MBA PDF + media-plan Excel.
3. Expect: same UX and numbers as `main` for save/C1/export (no footer stamp on MBA; client totals still accepted by `/api/mba/generate`).
4. Spot-check network: PUT `/api/mediaplans/mba/{mba}` still succeeds. Soft fee-snapshot POSTs may 404/log if `mba_fee_snapshots` is not created yet — save must still succeed (soft-fail).

---

## (b) Log week — `PLANC_SERVER_AUTHORITY=log` + `PLANC_C1_FULL_SCOPE=log`

### Where to watch (Vercel)

1. Vercel project → **Deployments** → open the deployment that has the log flags.
2. **Logs** / **Runtime Logs** (Observability).
3. Filter / search for these prefixes (exact strings):

| Prefix | Source |
|--------|--------|
| `[planc-authority-diff]` | `lib/finance/authority/computeAndPersist.ts` — client vs server schedule money beyond $0.01 |
| `[planc-c1-fullscope]` | `lib/finance/c1FullScopeGate.ts` — adserving / production / campaign-total deltas |

Optional (always-on soft paths, not flag-gated):

| Prefix | Meaning |
|--------|---------|
| `[planc-feesnap-fallback]` | Version had no fee snapshot; C1 used live `feeLoading` |

### Drift report script

```bash
# From repo root, with Xano env configured (same as app)
npx tsx scripts/c1-fullscope-drift-report.ts
```

- Scans booked/approved published versions; writes summary to stdout and CSV (`scripts/c1-fullscope-drift-report.csv` when enabled by the script).
- Triage every violation row before considering `enforce`.

---

## (c) Enforce flip criteria

Flip `PLANC_SERVER_AUTHORITY=enforce` and/or `PLANC_C1_FULL_SCOPE=enforce` only when:

1. **Zero unexplained** `[planc-authority-diff]` lines for a full week of real saves (any remaining diffs understood + accepted or fixed).
2. **`c1-fullscope-drift-report.ts` triaged** — no open unexplained campaign/line violations (or each has an owner + ticket).
3. Smoke (a) still green with flags off on a control campaign after the log week (regression check).
4. **S1-P1b line detail is live** — server-computed schedules must carry `month.lineItems` (see regression in `lib/finance/authority/__tests__/computeAndPersist.test.ts`). **Do not enable `PLANC_SERVER_AUTHORITY=enforce` anywhere until this lands** — enforce previously replaced client schedules that had per-line detail with header-only schedules (totals intact, permanently un-migratable to `plan_billing_rows`).

### Enforce smoke — line-detail assertion

After a save with `PLANC_SERVER_AUTHORITY=enforce` on a campaign that has channel lines:

1. Load the persisted version `billingSchedule` (Xano / network response).
2. Assert `billingMonthsHaveDetailedLineItems(months) === true` (at least one month has a non-empty `lineItems[mediaKey]` array).
3. Spot-check one line id under the expected media key with non-zero `monthlyAmounts[monthYear]` (or intentionally zero for client-pays billing media).

Do **not** flip `PLANC_DOCS_FROM_PERSISTED=on` in the same change-set as first enforce; docs flag is a separate cutover (callers send identifiers; MBA approval gate 422s drafts).

---

## (d) Rollback

1. Set `PLANC_SERVER_AUTHORITY`, `PLANC_C1_FULL_SCOPE`, `PLANC_DOCS_FROM_PERSISTED`, and `NEXT_PUBLIC_PLANC_DOCS_FROM_PERSISTED` back to `off` / unset in the Vercel environment.
2. **Redeploy required:** Vercel injects env at build/runtime per deployment. Changing Project → Settings → Environment Variables does **not** mutate an already-serving deployment until you **Redeploy** (or a new git deploy picks them up). Dashboard env edits typically prompt a redeploy — complete it before calling rollback “done”.
3. No code revert needed for flag-gated money behaviour; auth on document routes remains (intentional — see audit).

---

## Flag audit vs `origin/main` (paste)

### Commands run

```text
# Branch already contains latest main (git merge origin/main → Already up to date)
git merge-base HEAD origin/main   # == origin/main tip at verify time
git rev-parse HEAD origin/main

rg -n "process\.env\.PLANC_|process\.env\.NEXT_PUBLIC_PLANC_" --glob "*.ts" --glob "*.tsx"

rg -n "requireRole" \
  app/api/mba/generate/route.ts \
  app/api/mediaplans/generate-pdf/route.ts \
  app/api/mediaplans/[id]/download/route.ts \
  app/api/mediaplans/versions/[id]/documents/route.ts \
  app/api/scopes-of-work/generate-pdf/route.ts

rg -n "writeFeeSnapshot|resolveFeeLoadingForVersion|readFeeSnapshot" app/api --glob "*.ts"

rg -n "billing-integrity|integrityTripwire" vercel.json app/api/cron
```

### `PLANC_*` env reads (flagged behaviour)

| Flag | Read sites |
|------|------------|
| `PLANC_SERVER_AUTHORITY` | `lib/finance/authority/computeAndPersist.ts` (+ tests); wired from MBA PUT + billing-schedule PATCH |
| `PLANC_C1_FULL_SCOPE` | `lib/finance/c1FullScopeGate.ts` (+ tests); wired inside C1 recompute |
| `PLANC_DOCS_FROM_PERSISTED` | `lib/finance/planCDocsFromPersisted.ts` → MBA generate + mediaplans generate-pdf |
| `NEXT_PUBLIC_PLANC_DOCS_FROM_PERSISTED` | create + MBA edit `generateMbaPdfBlob` fetch bodies |

When all flags are off: authority/full-scope gates are no-ops; docs routes keep legacy client totals.

### Unconditional behaviour changes vs main (Plan C / S0 scope)

| Change | Flagged? | Notes |
|--------|----------|-------|
| **Auth on document routes** (`requireRole` admin/manager) — MBA generate, mediaplans generate-pdf, versions documents upload, mediaplans download, scopes-of-work generate-pdf | **No** | **S0-P1 — intentional.** Only intentional product gate called out for Stage 1 “always on”. |
| Fee snapshot write/resolve on MBA PUT + billing-schedule PATCH (`writeFeeSnapshot*`, `resolveFeeLoadingForVersion`) | **No** | Soft-fail if `mba_fee_snapshots` missing (log + live fees). Extra Xano traffic / `[planc-feesnap-fallback]` when table empty. Not behind `PLANC_*`. |
| Nightly `/api/cron/billing-integrity` + `vercel.json` cron | **No** | S0 tripwire — ops, not money-path UX. |
| Xano auth-header sweep / inventory (S0) | **No** | Infrastructure; should be auth-equivalent, not money-formula change. |

**Summary for Friday:** money-path flips for authority + C1 full-scope + docs-from-persisted are behind `PLANC_*`. The document **auth** requirement is the intentional always-on product change (S0-P1). Fee-snapshot soft writes and the integrity cron are also always-on but soft/ops — call them out if the Friday window assumes “zero new network calls”.

### Verify (this commit)

- `npm run typecheck` — clean
- `npx vitest run` — green (include list trimmed to existing suites; `channelHydrationGate` restored as `node:test` and excluded from vitest)
