# S8 soak — tree cleanup + perf baseline

Status: done  
Branch: `localhost`  
Harness: `scripts/verify/soak-s8-perf-baseline.ts` (report-only)

## One-paragraph summary

S8 closed dead code (D-2/D-3/D-5 + unused channel axios), pinned today’s S1–S7/O4.5/DI/approvals commits in the brain, and documented the **actual** fee-snapshot rule (publish-only writes — not drafts). Perf baseline under live `.env.local` shows finance-hub cost dominated by the still-Xano `relevantPlanVersions` crawl (~4.5s, P-2), while `DATA_BACKEND_FINANCE_SCHEDULE=shadow` compare is ~10ms and `schedule_months` ~130ms — that is the M8 `rows` flip yardstick. Campaigns list cold postgres merge ~1.5s / warm TTL ~0ms (P-8 client remount unchanged). Also fixed a leftover S6 syntax break in `PublishersPageClient` (`useMemo` extra `})`) so parse-level `tsc` is unblocked; remaining `tsc` diagnostics are pre-existing from S3/S5/S7/O4.5, not from S8 deletions.

## Flag state (read from `.env.local` at measure time — never remembered)

| Flag | Value |
|---|---|
| `DATA_BACKEND` | `postgres` |
| `WRITE_BACKEND` | `postgres` |
| `DATA_BACKEND_PLANS` | (unset → `postgres` via global) |
| `DATA_BACKEND_FINANCE` | (unset → `postgres`) |
| `DATA_BACKEND_KPI` | (unset → `postgres`) |
| `DATA_BACKEND_APPROVALS` | `postgres` |
| `DATA_BACKEND_PLAN_DETAIL` | (unset → `xano`) |
| `DATA_BACKEND_FINANCE_SCHEDULE` | `shadow` |
| `SAVE_GATE_FULL_SCOPE` | `log` |
| `FEE_SNAPSHOT_WRITE_ONCE` | (unset → `off`) |
| `MEDIA_PLAN_VERSIONS_CACHE_TTL_MS` | `300000` |

## Perf baseline table (M8 `rows` reference)

| Surface | Metric | ms | Attribution |
|---|---|---:|---|
| module boot | import graph | 1688 | dev-compile / cold module noise |
| campaigns list | cold `getCachedMediaPlansList` | 1516 | postgres versions+masters merge; P-2 N/A |
| campaigns list | warm cache | 0 | server coalesce (not P-8 client remount) |
| finance hub | `relevantPlanVersions` (2026-08) | 4536 | **Xano** masters + full versions crawl (P-2) |
| finance hub | `schedule_months` query | 132 | PG query for shadow |
| finance hub | hydrate shadow total | 142 | query + blob↔rows compare |
| finance hub | shadow compare (est.) | **10** | hydrate − standalone query; **M8 rows flip baseline** |
| finance hub | hydrate 2nd pass | 74 | repeat shadow cost |

Notes: 55 relevant versions / 1054 all versions; shadowDiffCount=0; 4 zero-row fallbacks (incl. krusty015 tip without `schedule_months` rows). P-3 still gated by `DATA_BACKEND_PLAN_DETAIL=xano`.

## Dead code (S8)

| ID | Action |
|---|---|
| D-2 `ttlCache.ts` | deleted |
| D-3 `lib/billing.ts` | already absent — register closed |
| D-5 `_prog_extract.txt` | deleted |
| D-7 unused axios | stripped television/social/newspaper/influencers/integration/prog-display/prog-ooh |
| D-1 `avaSnowflake` | **left** (Luke repair-or-retire) |
| D-7 cinema mismatch | **left** (separate verify) |

## S-run summary (S1–S8)

| Slot | Outcome | Commit |
|---|---|---|
| S1 | Dashboard monthly treemap → postgres `schedule_months` | `73fd1bbe` |
| S2 | Mirror carries schedule blobs + durable mirror failure | `9eccdd51` |
| S3 | Draft doc steps skipped (not “Saving with Errors”) | `231fc295` |
| S4 | Soft-fail empty-list reads stopped | `48f2472b` |
| S5 | MBA GET postgres behind inert `DATA_BACKEND_PLAN_DETAIL` | `6f1f0323` |
| S6 | Shared `matchText` + list filter adopt | `1df2d1fc` |
| S7 | Admin KPI write named errors (C-18) | `0e34fc13` |
| S8 | Soak cleanup + perf baseline + register | *(this commit)* |
| O4.5 / C-21 | feeLoading on publish; evidence → krusty015 **v4** | `53c4029f` |
| DI-9 / DI-10 | list client name + mba string identity | `58ed536d` / `3fc3517e` |
| Approvals X1 | PG-authoritative `mba_line_approvals` | `48654e11` |

## Fee-snapshot rule (code, before any `FEE_SNAPSHOT_WRITE_ONCE` flip)

`savePlanVersion` writes `mba_fee_snapshots` **only** when `mode === "publish"`. `draft` and `new_version` do not. Bodies may still include `feeSnapshot`/`feeLoading` on every T4c save. Default = upsert; `FEE_SNAPSHOT_WRITE_ONCE=on` = insert-once + admin resnapshot.

## Left red

- P-2 finance hub still Xano-crawls versions (~4.5s) under `DATA_BACKEND=postgres`
- C-22 / P-3: `DATA_BACKEND_PLAN_DETAIL` still `xano` (postgres path inert)
- C-20 percent-unit data migration pending Luke
- D-1 avaSnowflake, D-7 cinema POST/GET table mismatch
- Shadow zero-row fallbacks (krusty015 tip among them) — schedule_months gaps
- KPI writes still Xano-only until T4 (502 residual)
