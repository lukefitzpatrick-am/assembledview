# The AssembledView Brain

This folder is the **single source of truth for how AssembledView fits together**: what each domain does, what depends on what, and what breaks when you change things. It exists because the app is deeply interconnected and changes in one place routinely cause chaos elsewhere.

Generated 2026-07-29 from a full-codebase analysis at commit `ecc948b` (main), synthesizing the ~60 root discovery/audit docs plus fresh verified import-graph analysis.

## The one rule

> **Before changing anything: read the relevant module page and check BLAST-RADIUS.md.
> After changing anything: update the brain in the same commit.**

This rule is enforced for AI tools via `/CLAUDE.md` (Claude) and `/.cursor/rules/brain.mdc` (Cursor). If the brain and the code disagree, the code is right — fix the brain in the same commit you noticed.

## Contents

| Page | What it answers |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | What is the system? Stack, domains, data flow, route map |
| [BLAST-RADIUS.md](./BLAST-RADIUS.md) | **"If I touch X, what else breaks?"** Choke points ranked by import count + per-file impact tables |
| [INVARIANTS.md](./INVARIANTS.md) | Locked decisions and laws every change must respect (fee formulas, versioning rules, ZERO-$ LAW, naming law…) |
| [KNOWN-ISSUES.md](./KNOWN-ISSUES.md) | Recorded tech debt & security findings, with IDs. Check before "discovering" a bug that's already known |
| [dirty-state-inventory.md](./dirty-state-inventory.md) | MBA create/edit hand-rolled dirty flag: 15 Expert sites, clear-on-SUCCESS vs ATTEMPT |
| [version-control-stage1-consumers.md](./version-control-stage1-consumers.md) | Stage 1 VC: every site that infers publication from `campaign_status` (input to `published_at` migration) |
| [codex-write-failure-static.md](./codex-write-failure-static.md) | Codex tasks/team zero-writes: flag/role/page auth + create-path static diagnosis (pre-browser) |
| [codex-team-create-never-reached.md](./codex-team-create-never-reached.md) | Settled: `team_members` seq never advanced because Team create was never submitted — path live, no product fix |
| [codex-client-id-fk.md](./codex-client-id-fk.md) | Codex `client_id` has no FK to `clients` (DI-12); API does not validate existence; options before Stage 1 |
| [fail-soft-consumers.md](./fail-soft-consumers.md) | Fourteen `GET /api/clients` callers that ignore `x-warning: clients-unavailable` — severity ranked |
| [READ-FAILURE-REGISTER.md](./READ-FAILURE-REGISTER.md) | M7: lib/data catch→[] conversions vs dying-at-T6 Xano page wrappers |
| [API-DYNAMIC-ROUTE-GATES.md](./API-DYNAMIC-ROUTE-GATES.md) | O6 / SEC-10 inventory of `app/api/**/[param]` gates vs collection siblings — input for T6 RLS (admin \| client) |
| [tenant-isolation-audit.md](./tenant-isolation-audit.md) | Snapshot audit (pre-D1/D2 counts may drift) — prefer [api-tenant-classification.md](./api-tenant-classification.md) for living recount |
| [api-tenant-classification.md](./api-tenant-classification.md) | Living recount of every `app/api` handler: class + mechanism + remaining exposures + admin consolidation candidates (regenerate via script) |
| [XANO-SEVERANCE-REGISTER.md](./XANO-SEVERANCE-REGISTER.md) | X-AUDIT-1: every `app/api` + lib live Xano dependency, verdicts (DUAL-DONE/PORT/RETIRE/MIRROR/TOOLING), vault storage sizing, X1–X8 owner prompts |
| [modules/media-plans.md](./modules/media-plans.md) | Media plan builder, MBA versioning, 20 channel tables, save/publish protocol |
| [modules/pacing.md](./modules/pacing.md) | Pacing & delivery: Snowflake facts × Xano plans, caching, orphans |
| [modules/finance-billing.md](./modules/finance-billing.md) | Finance hub, billing schedules, fee engine, forecast & snapshots |
| [modules/shared-core.md](./modules/shared-core.md) | Xano layer, Auth0/RBAC, caches, env vars — the code everything sits on |
| [modules/ava.md](./modules/ava.md) | The in-app AI assistant: tools, bridge, skills |
| [modules/kpi.md](./modules/kpi.md) | Three-tier KPI targets, fan-out, delivery target curves |
| [modules/trafficking-creative.md](./modules/trafficking-creative.md) | Naming/trafficking builder, creative assets, mockups, ad copy |
| [modules/dashboards-charts-exports.md](./modules/dashboards-charts-exports.md) | Client dashboards, chart system, document/export generation, email |
| [modules/admin-misc.md](./modules/admin-misc.md) | Admin/users, knowledge hub, scripts (Codex → [modules/codex.md](./modules/codex.md)) |
| [modules/codex.md](./modules/codex.md) | Codex Stage 0: Tasks/Team UI, API gates, 12 tables, fortnight observations log |
| [modules/m365.md](./modules/m365.md) | Microsoft Graph provisioning (sites/Teams); Entra app permissions; flag-off default; M4 reconciliation admin |

## How to keep it alive

1. **Scoping a change?** Open the module page for the area, then search BLAST-RADIUS.md for every file you plan to touch. The listed downstream consumers are your test checklist.
2. **Made a change that alters anything the brain describes** (a contract, a dependency, a data shape, a gotcha resolved or introduced)? Edit the relevant page in the same PR. Keep edits surgical — these are reference pages, not changelogs.
3. **Made a decision?** Append it to INVARIANTS.md (one line, present tense, no dates/branch names).
4. **Found new debt?** Add it to KNOWN-ISSUES.md with the next free ID. Fixed something listed? Mark it fixed, don't delete.
5. **New durable knowledge does not go in the repo root.** Root discovery files are the legacy pattern this brain replaces. Time-bound work plans go in `docs/superpowers/` per its template.

## Regenerating the visual map

`docs/brain/dependency-map.html` is an interactive visualization of this brain (domains, connections, blast radius). It is hand-maintained alongside these pages — when you add/remove a major module dependency, update the `GRAPH` data block at the top of that file.
