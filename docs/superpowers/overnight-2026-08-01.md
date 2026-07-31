# Overnight batch report — 2026-08-01 morning

Status: complete (code half)  
Date: 2026-07-31 night → 2026-08-01 morning  
Branch: `localhost`  
Driver: Cursor overnight O1–O8

## O1–O7 outcomes

| ID | Commit | Outcome |
|---|---|---|
| **O1** | `a86a96a3` | Tree safe: cleared stale `.worktrees` gitlinks, `.gitignore` for probes/scratch, `test:save-plan` server-only shim, tsconfig cleanup. PC7 left flag-off. |
| **O2** | `caef9b70` | T4a report-only byte-diff soak script + `billing_overrides` / `schedule_months.source` fixture assertions. |
| **O3** | `83faba8c` | T4c postgres save payload contracts pinned (`test:postgres-save-mode`): masterId, leave-draft increment with lazy-empty versions, status vocab, `MISSING_CAMPAIGN_STATUS`, 23505 disambiguation, create+edit twin wiring. |
| **O4** | `613e814e` | Postgres AUTO billing drift no longer forces reset-to-auto / blocks save; correction toast path; Xano reject-on-AUTO-divergence unchanged. |
| **O5** | `0af9fb85` | AV-25 v2: drop magnitude percent heuristic; single `lib/kpi/percentUnits.ts`. Ambiguous campaign_kpi id 798 flagged; C-20 migration still Luke. |
| **O6** | `6285f1a3` | Gated lagging dynamic `[id]` routes (SOW, campaigns, mbanumber). Inventory: `docs/brain/API-DYNAMIC-ROUTE-GATES.md`. SEC-10 live probe still morning. |
| **O7** | `0617e361` | Matcher hardening only (no live cron): day-10 one card/period; Dispute → expected CN + negative AR auto-reconcile; FBR-proxy replay tier rates flat. |
| **O8** | docs commit | Brain save-path facts, gitignore/worktree verify, this morning flag truth table. |

## Flag state — as read from `.env.local` + code defaults (2026-07-31 ~22:00 Sydney)

Only two migration flags are **set** in `.env.local`. Everything else is the code default. Do not assume remembered overnight targets.

| Flag | Actual now | Source | Notes |
|---|---|---|---|
| `WRITE_BACKEND` | **`postgres`** | `.env.local` | Editor uses `POST /api/plans/save`. |
| `DATA_BACKEND` | **`shadow`** | `.env.local` | Global read shadow; per-domain overrides unset → inherit. |
| `DATA_BACKEND_FINANCE_SCHEDULE` | **`blob`** | default (unset) | **Not** `shadow`. PC1 still serving schedule blobs. |
| `SAVE_GATE_FULL_SCOPE` | **`off`** | default (unset) | **Not** `log`. C1 gate inert. |
| `DATA_BACKEND_APPROVALS` | **`shadow`** (inherits) | unset → global | Not pinned to xano. Writes follow `WRITE_BACKEND=postgres` via `writeApprovals`. X1 still open as a product gate, not an env pin. |
| `NEXT_PUBLIC_BILLING_BALANCER` | **`off`** | default | |
| `NEXT_PUBLIC_PLAN_DRAFTS` | **`off`** | default | PC7 chrome off. |
| `FINANCE_PERIODS` | **`off`** | default | |

### Still red / morning work

- Friday flip matrix A1–A6 / B1–B3 / X1 in `docs/superpowers/friday-flip-2026-07-31-step2-write-path.md` still unchecked (browser).
- SEC-10 live probe + O6 class-(c) checklist (deferred from O6/O7).
- O5 ambiguous KPI row + C-20 migration.
- Remembered targets `FINANCE_SCHEDULE=shadow` / `FULL_SCOPE=log` / `APPROVALS=xano-until-X1` are **not** what `.env.local` says — flip deliberately if morning wants them.
- Orphan `.worktrees/*` dirs removed O8; prune shows only primary worktree; no `index.lock`.
- Untracked local scratch left alone (not committed): `CLAUDE.md`, `docs/brain/DOC-MAP.md`, `dependency-map.html`, `trafficking-creative.md`, `scripts/xero-daily.ps1`.
