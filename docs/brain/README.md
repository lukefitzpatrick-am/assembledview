# The AssembledView Brain

Single source of truth for how AssembledView fits together: what each section does, what it sits on, what depends on what, and what breaks when you change it.

Rebuilt 2026-08-27 from a full local review of branch `localhost` at `39ed2590`, verified against the live Supabase project `slpdibnxtpdlttbbczvg` (78 public tables, Sydney).

## The one rule

> Before changing anything: open the section entry in `MAP.md`, then check `BLAST-RADIUS.md` for every file you plan to touch.
> After changing anything: update the brain in the same commit.

Enforced for AI tools via `/CLAUDE.md` (Claude) and `/.cursor/rules/brain.mdc` (Cursor). If the brain and the code disagree, the code is right — fix the brain in the same commit you noticed.

## Read me in this order

| # | Page | Answers |
|---|---|---|
| 1 | **[MAP.md](./MAP.md)** | "Where does this live?" The section and hierarchy map: every module, its routes, components, lib, API and tables. **Start here for every task.** |
| 2 | **[DATA-MODEL.md](./DATA-MODEL.md)** | "What is the shape of the data?" 78 Supabase tables, families, relationships, join keys, frozen contracts. |
| 3 | **[CONVENTIONS.md](./CONVENTIONS.md)** | "How is code written here?" Data access, route auth, money, dates, naming, tests. |
| 4 | **[AI-DIRECTIONS.md](./AI-DIRECTIONS.md)** | "How do I brief an AI on this repo without it going wrong?" Context budgets, prompt-pack shape, routing rules per task type. |
| 5 | **[INVARIANTS.md](./INVARIANTS.md)** | Locked decisions and laws every change must respect. Never violate; escalate instead. |
| 6 | **[BLAST-RADIUS.md](./BLAST-RADIUS.md)** | "If I touch X, what else breaks?" Choke points ranked by import count, per-file impact tables. |
| 7 | **[KNOWN-ISSUES.md](./KNOWN-ISSUES.md)** | Recorded debt and security findings with IDs. Check before "discovering" a known bug. |

## Section pages

One page per section of the app. `MAP.md` routes you to the right one.

| Page | Section |
|---|---|
| [modules/media-plans.md](./modules/media-plans.md) | Plan builder, MBA versioning, 20 channels, save/publish |
| [modules/finance-billing.md](./modules/finance-billing.md) | Finance hub, billing schedules, fee engine, forecast, periods, Xero |
| [modules/pacing.md](./modules/pacing.md) | Delivery pacing: Snowflake facts × plan lines |
| [modules/kpi.md](./modules/kpi.md) | Three-tier KPI targets and fan-out |
| [modules/dashboards-charts-exports.md](./modules/dashboards-charts-exports.md) | Client dashboards, chart system, document generation, email |
| [modules/trafficking-creative.md](./modules/trafficking-creative.md) | Naming/trafficking builder, creative assets, mockups, ad copy |
| [modules/ava.md](./modules/ava.md) | The in-app assistant: agent loop, tools, skills, voice |
| [modules/codex.md](./modules/codex.md) | Tasks, team, client notes, Fireflies, MyHours |
| [modules/shared-core.md](./modules/shared-core.md) | Data access, Auth0/RBAC, caches, env, nav, utils |
| [modules/m365.md](./modules/m365.md) | Microsoft Graph provisioning |
| [modules/admin-misc.md](./modules/admin-misc.md) | Admin surfaces, knowledge hub, scripts |

## Registers and audits (reference, not required reading)

`API-DYNAMIC-ROUTE-GATES.md` · `api-tenant-classification.md` · `tenant-isolation-audit.md` · `dirty-state-inventory.md` · `fail-soft-consumers.md` · `READ-FAILURE-REGISTER.md` · `version-control-stage1-consumers.md` · `XANO-SEVERANCE-REGISTER.md` (historical — Xano is gone from the runtime read path, and the plan-save mirror is flag-gated off) · `codex-*.md` · `DISCOVERY-bare-line-ids.md` · `DISCOVERY-ingest-line-identity.md` · `dependency-map.html`

## Keeping it alive

1. Scoping a change → `MAP.md` section entry, then `BLAST-RADIUS.md` for each file.
2. Change altered something the brain describes (a contract, a dependency edge, a data shape, a gotcha) → edit the page in the same commit. Surgical edits, present tense, no dates or branch names.
3. New decision → one line in `INVARIANTS.md`.
4. New debt → `KNOWN-ISSUES.md` with the next free ID. Fixed → mark `FIXED (commit)`, never delete the row.
5. New migration → add the row to `DATA-MODEL.md` and `db/README.md` in the same commit as the SQL.
6. Durable knowledge never lands in the repo root. Root discovery files are the legacy pattern this brain replaces. Time-bound plans go in `docs/superpowers/`.

## Human-facing companion

`docs/handbook/` is the same system explained in prose for people. It is written to be read start to finish; this brain is written to be jumped into.
