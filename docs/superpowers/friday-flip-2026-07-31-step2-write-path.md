# Friday-night flip — Step 2: write-path hard blockers

Status: in progress  
Date: 2026-07-31  
Driver: Luke (browser) · Recorder: Cursor  
Gate: ALL A1–A6 + B1–B3 green + `db:recon` exit 0 + X1 green → Luke flips both backends → SU-1. Any red → STOP.

## Pre-flight (before A1)

| Check | Expected | Actual |
|---|---|---|
| `DATA_BACKEND` | leave as-is (`shadow` OK — global flip later) | `shadow` (pre-session) |
| `WRITE_BACKEND` | `postgres` for A1–A4, A6, B*; `xano` only for A5 | `postgres` (Luke set) |
| Dev server | restarted after flag change | Luke sets WRITE_BACKEND; restart after this masterId fix too |
| Fix landed | masterId from `media_plan_master_id` + 422 mismatch + KPI static import | ⬜ A1 pending on krusty013/012 |
| Fixture MBA (draft) | Krusty draft with real lines | Prefer `krusty014` (CLAUDE SAVE REPRO) or `krusty013` (All20) |
| Kill-test MBA | large multi-channel | `PENFOLD015` / `PENFOLD016`-class |

## A — T4c manual matrix

| ID | Test | Pass criteria | Result | Notes |
|---|---|---|---|---|
| A1 | Draft save → reload | Grid fidelity exact; bursts intact | ⬜ | MBA / version / burst spot-check |
| A2 | Overwrite same draft | `version_number` unchanged; in-place replace | ⬜ | Save modal should say overwrite |
| A3 | Publish | Version/status per `resolvePostgresSaveMode` (draft+forceIncrement or non-draft → next version + publish); reload correct | ⬜ | Fix: lazy-empty versionRowCount no longer forces v1; expect draft→booked on v1 → **v2 published** (Xano parity) |
| A4 | Publish 0 lines | Rejected; UI shows BOSS006 ("Cannot publish version with 0 line items") | ⬜ | |
| A5 | `WRITE_BACKEND=xano` one save | Old fan-out path; byte-identical behaviour (no `/api/plans/save`) | ⬜ | Flip flag → restart → save → restore postgres |
| A6 | Kill mid-save | Fully old **or** fully new — never partial | ⬜ | Network tab: abort during POST `/api/plans/save` |

## B — Live mirror

| ID | Test | Pass criteria | Result | Notes |
|---|---|---|---|---|
| B1 | Draft save dual-store counts | Per-channel row counts match PG ↔ Xano **including** `media_plan_production` | ⬜ | MBA + version: |
| B2 | Block one channel POST | Save succeeds; banner `mirror: "failed"`; `POST /api/admin/xano-mirror/retry` repairs; counts match; capture `mirrorDurationMs` / `durationMs` | ⬜ | ms: |
| B3 | Mirror failure log empty | After retry: no outstanding unrepaired `plans-mirror` (restart `next dev` clears process-local ring if needed) | ⬜ | Flip precondition #1 |

## C — Last free reload + X1

| Step | Command / check | Result |
|---|---|---|
| C1 | `npm run xano:export` | ⬜ |
| C2 | `npm run db:etl` | ⬜ |
| C3 | `npm run db:recon` | exit: ___ |
| X1a | `mba_line_approvals` row count export vs PG | ⬜ |
| X1b | `npm run test:approvals` — round-trip **not** skipped | ⬜ |
| X1c | Shadow diff: one MBA with exclusions + one without | ⬜ |

## Gate

- [ ] ALL green → Luke sets `DATA_BACKEND=postgres` + `WRITE_BACKEND=postgres` in `.env.local` → SU-1 smoke
- [ ] Any red → STOP, do not flip
