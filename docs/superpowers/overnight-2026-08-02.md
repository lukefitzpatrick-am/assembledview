# Overnight batch report — 2026-08-02 morning

Status: N5 process record + morning truth  
Date: 2026-08-01 night → 2026-08-02 morning  
Branch: `localhost`  
Driver: Cursor overnight N0–N9

## RED — read first

1. **Working tree is NOT clean.** Unrelated local WIP remains (not from N0–N9):  
   `app/api/mediaplans/versions/[id]/billing-schedule/route.ts`,  
   `components/billing/AlterBillingDialog.tsx`,  
   `components/media-containers/ExpertGrid.tsx`,  
   `docs/brain/diagnostics/mba-editor-2026-07-31.md`,  
   `lib/mediaplan/expertGridKeyboardNav.ts`,  
   `lib/naming/suggestAvaNamingTokens.ts`,  
   plus usual untracked scratch / `.next` noise. Do **not** treat the tree as merge-ready without triage.
2. **SEC-10** still **live probe pending** (`KNOWN-ISSUES` — static complete via O6 + SEC-G only).
3. **B4-1 VERIFY screenshots** were not captured (Auth0 session required); admin landing + slide-overs need Luke eyes.
4. **B4-1 T1/T3** are handoffs (Ask Ava / Codex task dialog), not full in-app builders — confidence under 90% until live smoke.

## N0–N9 outcomes

Mapped to commits that landed on `localhost` in this overnight window (N0 paste → product tickets → this N5 docs commit), in commit order after N0. Pack ticket titles in parentheses. B4-1’s “build on N4 gated state” = **N1 SEC-G** creative/`checkClientMbaAccess` soft-spot (not N4 DEDUPE-2).

| ID | SHA | Result | One line |
|---|---|---|---|
| **N0** | `6ab59a8e` + `c7c68517` | **green** | EDGE-1 channel-load budgets 45s/90s/150s + late-success clear; switchParity ESLint fix for native Switch (C-31). Pushed with N0. |
| **N1** | `60f15932` | **green** | SEC-G: gate AMBIGUOUS dynamic routes per morning answers; creative soft-spot via `checkClientMbaAccess` (SEC-10 static complete) — gated state for N9/B4-1. |
| **N2** | `4b3b8c77` | **green** | FY-1 AU financial-year overlap filter on Home + Campaigns. |
| **N3** | `51e13cd5` | **green** | DEDUPE-1: coalesce `mba-line-approvals` GET via `coalescedGetJson`. |
| **N4** | `b8c7ba0f` | **green** | DEDUPE-2: coalesce media-details reference GETs. |
| **N5** | *(this docs commit)* | **green** | Process record (FN7), C-33 class-(c) manual-match disposition, F-28 FIN-6 blank legal/ABN note, this morning truth report. |
| **N6** | `2294c75e` | **green** | B2-1 shared ChartExport PNG+CSV on `BaseChartCard`. |
| **N7** | `e3f800b7` | **green** | B1-1 admin-only read-only campaign KPI pacing strip. |
| **N8** | `862885c2` | **green** | B3-1 admin campaign report export + period picker (native pptx charts). |
| **N9** | `828bc222` | **green** | B4-1 admin process-first creative landing (T1 Ask Ava / T2 upload / T3 Codex); client dashboard creative untouched. |

## Flag state — live read from `.env.local` (2026-08-02)

Do **not** trust remembered overnight targets. Values below are from a direct `.env.local` read this session (flag keys only; secrets omitted).

| Flag | Actual now | Source | Notes |
|---|---|---|---|
| `WRITE_BACKEND` | **`postgres`** | `.env.local` | Editor save path. |
| `DATA_BACKEND` | **`postgres`** | `.env.local` | Global reads postgres (not shadow). |
| `DATA_BACKEND_FINANCE_SCHEDULE` | **`shadow`** | `.env.local` | Finance schedule shadow path on. |
| `SAVE_GATE_FULL_SCOPE` | **`log`** | `.env.local` | C1 gate logging (not enforce). |
| `DATA_BACKEND_APPROVALS` | **`postgres`** | `.env.local` | Approvals PG-authoritative. |
| `CODEX_V2` | **`on`** | `.env.local` | Codex /tasks + `/api/codex/*` visible. |
| `DATA_BACKEND_PLAN_DETAIL` | **unset** → code default | default | MBA GET postgres serve still off until flip (C-22). |
| `NEXT_PUBLIC_BILLING_BALANCER` | **unset** → **off** | default | |
| `NEXT_PUBLIC_PLAN_DRAFTS` | **unset** → **off** | default | PC7 chrome off. |
| `FINANCE_PERIODS` | **unset** → **off** | default | |
| `PLANC_SERVER_AUTHORITY` | **unset** | default | Enforce still off unless set elsewhere. |

Delta vs 2026-08-01 morning report: `DATA_BACKEND` was **shadow**, now **postgres**; `SAVE_GATE_FULL_SCOPE` was default **off**, now **log**; `DATA_BACKEND_APPROVALS` was inherit-shadow, now pinned **postgres**; `CODEX_V2=on` present; `DATA_BACKEND_FINANCE_SCHEDULE=shadow` now explicitly set (was default blob).

## Register updates in this N5 commit

| Register | Change |
|---|---|
| `fn7-finance-sections-cutover-2026-08-01.md` | Process record — FN7 Remove-Item after Luke approval; sequencing breach = human ordering error; author-only Phase D rule stands |
| `KNOWN-ISSUES.md` **C-33** | PC6 class-(c) `golf021` / `golf020` / `PGAAUS005` / `PENFOLD008`/`010`/`011` → standing manual invoice-matching; not a launch gate |
| `KNOWN-ISSUES.md` **F-28** + `finance-billing.md` | FIN-6: Simmone Logue + Olive Grove legal name/ABN + internal buckets blank by decision |

## Tree cleanliness

| Check | Result |
|---|---|
| Branch | `localhost` |
| N0–N9 code commits | Present (see table) |
| Docs-only N5 | This file + register/process-record edits |
| Clean index for merge | **NO** — see RED #1 dirty WIP |
| Known scratch (leave alone) | `CLAUDE.md`, `docs/brain/DOC-MAP.md`, `dependency-map.html`, trafficking notes, `scripts/xero-daily.ps1` as applicable |

## Morning follow-ups (not overnight scope)

- Triage or stash the six dirty WIP files before any push/merge.
- SEC-10 live probe.
- B4-1 admin visual smoke + client `/dashboard/[slug]/creative` unchanged check.
- Continue standing manual match for C-33 MBAs (no auto-match launch gate).
