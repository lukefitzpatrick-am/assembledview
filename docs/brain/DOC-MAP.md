# Doc Map — what to do with the legacy root docs

The repo root accumulated ~60 one-off discovery/audit markdown files from past sessions. Their durable knowledge has been folded into this brain (INVARIANTS, KNOWN-ISSUES, BLAST-RADIUS, module pages). This page is the disposition list. Suggested mechanics: `git mv` Tier-3 files into `docs/archive/` (history preserved), keep Tier-2 where they are.

**Going forward: nothing new lands in the repo root.** Durable rules → `docs/brain/` (or `docs/<area>/`). Time-bound work plans/specs → `docs/superpowers/{plans,specs}/YYYY-MM-DD-slug.md` with an explicit `Status:` (the best format in the repo — standardise on it). No branch names or absolute paths in durable docs.

## Keep in place (durable reference)

`README.md` (refresh stale sections: "What's new", the Xano config paragraph referencing nonexistent `lib/xano/config.ts`) · `BRANCHING.md` · `XANO_SCRIPT_REFERENCE.md` (consider moving to `docs/xano/function-stacks.md`) · `finance-review-DECISIONS-LOG.md` (append-only decisions log — the style to copy) · the three `xano-*.json` exports (add a short note re when exported; reconcile DI-6) · `docs/auth0-rbac.md` · `docs/xano/pacing-api.md` · `docs/pacing/{adding-a-platform,search-suffix-matching,snowflake-deployment}.md` · `docs/finance-forecast-snapshots-xano.md` · `docs/client-dashboard/README.md` · `docs/sendgrid/pacing-template.md` · `docs/ava/current-state.md` · `docs/design-refresh/` (except BASELINE.md — unfilled template) · `docs/superpowers/**`.

## Archive after extraction (knowledge already folded into the brain)

- **Smoke/PR artifacts (dead branches):** STAGE-1A-PR, STAGE-1A-SMOKE, STAGE-2-SMOKE, STAGE-2-HOTFIX-SMOKE, STAGE-2-HOTFIX-2-SMOKE, STAGE_1_SUMMARY, STAGE_2_SUMMARY.
- **Session snapshots:** DISCOVERY-repo-state-2026-07-10, WIP-TRIAGE-2026-07-10, TS7_TRIAL, VERIFICATION_REPORT_mp_client_name, HARDCODED_URL_DISCOVERY, docs/security/npm-audit-snapshot, docs/design-refresh/BASELINE.md.
- **Superseded discovery:** AVA_DISCOVERY (→ docs/ava/current-state.md), DISCOVERY-creative-delivery (→ superpowers creative plans), FINANCE-UX-REDESIGN, PLANNING_TOOL_DISCOVERY (keep its supersession note), BURSTS_AUDIT, INTEGRATION_SHAPE_AUDIT (pre-Stage-1 world).
- **Executed build prompts:** KPI-BUILD-P1…P4b (locked decisions extracted to INVARIANTS).
- **Bug-specific, resolved or narrow:** DISCOVERY-gantt-label-overlap, DISCOVERY-chart-tooltip-pattern, LOGO_DISCOVERY, DISCOVERY_production_issue_candidates, CAMPAIGN_KPI_BACKFILL_FINDINGS, MI_*_DISCOVERY ×4, docs/kpi/KPI-ALLOW-ZERO-AUDIT, docs/MANUAL-BILLING-SPREADSHEET-PHASE0, docs/pacing/STAGE_2d-*/2e-* reports.
- **Mega-audits (archive but keep readable — deep reference for their areas):** AUDIT.md (§7's ~30 open questions live on in KNOWN-ISSUES), AUDIT-DOMAIN-4.md (note: contains duplicated paragraphs from a bad append ~lines 3138–3150), FEE_ALIGNMENT_DISCOVERY + _2, CLIENT_PAYS_FOR_MEDIA_AUDIT, BILLING_ALTERED_FLAG_DISCOVERY, SEAM5-* ×2, EXPERT_WRITE_AUDIT, BURSTS_TYPE_AUDIT, WORKING_DRAFT_DISCOVERY, DISCOVERY_production_* , STAGE-2-MIGRATION-PLAN, PERF-DISCOVERY-* ×2 (**stale on caching — do not trust**), FINANCE-HUB-STAGES-DISCOVERY (**stale — tabs dir gone**), FORECAST_GAP_DISCOVERY, PACING_OVERVIEW_REDESIGN_OPTIONS, PLATFORM_SURFACING_DISCOVERY, NAMING_TRAFFICKING_BUILDER_PLAN, PLANNING_TOOL_BLUEPRINT (engine law extracted), KPI_* discovery set, SEC-D2/SEC-D3 (findings tracked as SEC-* in KNOWN-ISSUES), domain-4/** (known-issues register promoted here).
- **Non-doc root strays:** `_claude_repo_snapshot.tgz`, `tsc-out.txt`, `npm-audit-snapshot.json` — delete or archive.
