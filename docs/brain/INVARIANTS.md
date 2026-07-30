# Invariants & Locked Decisions

Laws every change must respect. Present tense, no dates, no branch names. When a decision changes, edit the line — don't append a contradiction.

## Fee math (canonical: `lib/mediaplan/burstAmounts.ts::computeBurstAmounts`)

```
budgetIncludesFees:      fee = budget × pct/100          media = budget × (100−pct)/100
clientPaysForMedia:      fee = budget/(100−pct) × pct    mediaAmount = 0, deliveryMediaAmount = budget
standard (net budget):   fee = budget × pct/(100−pct)
bonus / package_inclusions: all zeros
pct === 100 → fee = 0 (division guard)
```

- Fee is a **slice of gross**, never `net × fee%` stacked on net (the legacy anti-pattern).
- Never round fee% before applying to gross. Never sum net media and apply fee% once at channel level.
- Rounding order: full float per burst → round at burst level (AUD 2dp) → sum rounded burst fees for campaign totals.
- All fee rates are 0–100 percent points, never 0–1. Missing/null → 0 at compute boundaries.
- Client fee columns map 1:1 to channels; Influencers = `feeinfluencers ?? feecontentcreator`; integration has NO fallback; production fee is always 0.
- **`client_pays_for_media` is a media gate only** — agency fees always flow to the agency invoice. Media rollup keeps `effectiveBudget = 0`; fee proration does not.
- Fee seed idempotency is **by value** (skip when equal within $0.01), not by-defined. Agency-fee month-total drift tolerance = $10 (modal save only).
- `billingMode?: "auto" | "manual"` lives inside `billingSchedule` JSON (no Xano column). Missing = auto. Sibling-stamp rule: marking a line manual materializes undefined siblings as explicit `auto`. Manual rows are protected from resync/backfill/seeding. Extend `billingMode`; never add a parallel `manuallyEdited` flag.
- Partial MBA: screen panel and Excel export must both read the same `partialMBAValues`; export must never fall through to `calculateAssembledFee()` while partial approval is active.

## Deliverable math (canonical: `lib/mediaplan/deliverableBudget.ts`)

- `bonus` / `package_inclusions` return **`NaN` as a "no recompute" sentinel** — callers preserve the existing value. Never treat that NaN as 0.
- CPM inverse = `(deliverables/1000) × unitRate`; forward = `(netBudget/unitRate) × 1000`.
- `fixed_cost` → 1 deliverable, everywhere.
- 18 runtime buy types: package, spots, cpt, cpp, panels, insertions, cpm, cpc, screens, cpcv, cpi, cps, cpv, fixed_cost, weekly_rate, monthly_rate, package_inclusions, bonus.
- `ProductionContainer` is structurally outside every shared container model — exclude it from "apply to all containers" changes.

## bursts_json contract (`lib/mediaplan/serializeBurstsJson.ts`)

- Money fields are **formatted strings** (`mediaAmount`, `feeAmount`).
- `mediaAmount` = *planned* media, sourced from `deliveryMediaAmount` → non-zero for client-pays lines.
- `lib/pacing/burst/parseBursts.ts` key names are contractually aligned with the serializer — change both or neither.
- Expert grids' `sumFee` reads `expertRowFeeSplit` output, NOT `bursts_json[].fee` — orthogonal paths that look identical.
- Burst money as `z.number()` vs string: `baseBurstShape` in `lib/mediaplan/schemas.ts` is extended by every channel schema — a type change there fans out to all of them.

## Versioning & plan identity

- Published version = `media_plan_master.version_number` (the watermark). There is no `latest_version_id`. Never use `max(versions)` to find "live".
- Draft saves overwrite the version row in place; leaving draft or changing the approval set increments (stage-then-publish: `deferMasterVersionPublish` → write children → PATCH master). Cannot return to Draft.
- Staged-but-unpublished rows are invisible (`filterPublishedVersions`) and reaped on next save of the same master.
- Clients see the last published version; doc downloads are disabled while a working draft exists.
- Version filtering accepts 6 column spellings as equivalent (`media_plan_version`, `media_plan_version_number`, `version_number`, `versionNumber`, `mp_plannumber`, `mp_plan_number`) — do not add a 7th.
- `media_plan_production` has no version FK — its MBA-only fallback must stay until Xano gains one (KI D4-K1).
- Forecast snapshots are immutable (INSERT only). Natural comparison key: `client_id + media_plan_version_id + group_key + line_key + month_key`. Forecast month amount priority: billingSchedule → deliverySchedule → bursts.

## Naming / trafficking law

- `lib/naming/templates.ts` is THE law for element orders — not any doc. DV360 templates cover all programmatic channels; CM360 covers other digital.
- `line_item_id` is ALWAYS the last element at each platform's pacing-grain level. `_` inside values, `-` as separator, charset `[a-z0-9_+x]`.
- Search suffix rule: the AV line-item code is the segment after the LAST hyphen in the ad/asset group name; codes are alphanumeric (no internal hyphens). Renaming in Google Ads breaks spend rollup.
- Trafficking builder is deliberately **non-persistent** (a download generator). Don't add a save; future pushes recompose from plan + templates.
- Xano JSON is snake_case; FKs are `clients_id`, `users_id`, `media_plan_id`. `mp_client_name` is the DB column, `client_name` the Xano input alias; create-page form uses `mp_client_name`, edit-page form uses `mp_clientname`.
- Publisher KPI `publisher` field stores the Xano publisher ID string, not the display name.

## Pacing law

- **ZERO-$ LAW (ad-serving / CM360):** delivery counts only. Never run `computePacing`/`computeStatus`, never surface spend/budget/variance, never treat spend=0 as `no_delivery`, exclude from $ rollups. Status vocabulary is only `serving | no-data`.
- The `PacingStatus` ladder order mirrors Snowflake `V_LINE_ITEM_PACING` — do not reorder. Bands: ±5% on track, ±15%.
- Direct pacing: `REPORTED_SPEND` (finance-smoothed) and `ACTUAL_PLATFORM_SPEND` are different ledgers — never mix into one KPI. Direct's status vocab doesn't map 1:1 to ahead/behind pills.
- "As of" is a single Melbourne date (`asOfDate`), not a range.
- `pacing_mappings` writes must write through to `MART_PACING.DIM_PLAN_MAPPING` then refresh facts — refresh order: `FACT_DELIVERY_DAILY` before `FACT_LINE_ITEM_PACING_DAILY`. Snowflake deletes are soft (`IS_ACTIVE = FALSE`).
- Snowflake dynamic tables can't ALTER the query body — adding a platform is `CREATE OR REPLACE`; new stage views must match `V_GOOGLE_ADS_AD_GROUP_DAILY` column list/order/types exactly.

## KPI law

- Three tiers: publisher benchmark → client override → campaign-saved. Fan-out to line grain via `lib/kpi/fanOut.ts`.
- Percent scale: `>= 1` means percentage points for ctr/vtr/conversion_rate; NEVER apply to cpv (dollars). `8 → 0.08` heuristic in `parsePercentHeuristic`.
- Unset metric returns **null, never 0** — `?? 0` converts "no target" into "target 0%".
- Ad-serving precedence (locked): manual `adServingRatePct > 0` → resolved KPI ctr/vtr → hardcoded baseline. `adServingRatePct` stays manual-only; KPI values pass separately into compute. Identity is per-line `lineItemId`.
- The two KPI target maps have different keys (see BLAST-RADIUS) — both must be updated for a new channel.
- `KpiHost` implementations differ on purpose: media-plan host defers persistence to campaign save; pacing host writes to Xano immediately.

## Planning engine law

- Compose on weighted counts (`wc`), never percentages; `reach% = Σ(channel wc) ÷ Σ(audience wc)`. Segments are single-select non-additive lenses.
- Suppressed cells stored null, excluded, badged. Search + Retail Media are benchmark-sourced and always badged non-RM.
- Roy Morgan waves are append-only by `wave_id`. Loader anchors by labels not indices; unknown channel labels are reported, never guessed.
- Provenance: `PLANNING_CHANNEL_BENCH` carries per-pillar `{value, source}`; carry-through maps to channel-level budget targets only — never fabricate line items.
- Client visibility per audience defaults OFF.

## AVA law

- `/api/chat-v2` only; admin-only (401 unauth / 403 non-admin); `AVA_ENGINE=off` kill switch; missing `ANTHROPIC_API_KEY` → 503.
- Form changes via the `apply_form_patch` tool only — no JSON-in-prose contract.
- Tools enforce scope internally from session roles/slugs/MBAs.
- `attachments` and `questions` are display-only — never write them back into Anthropic message history.
- MI runtime never writes `lib/specs/mi-library/` (vendored) — runtime output is Blob + email only.
- AVA Postgres reads use `AVA_DATABASE_URL` / role `ava_readonly` only — never the owner/`DATABASE_URL` connection.
- AVA tool `fy` = Australian FY **ending** year (`lib/ava/tools/fyToRange.ts`); finance hub `fyMonthRange` stays start-year. Do not conflate.

## UI / design system

- `Panel`/`PanelRow`/`PanelRowCell` mandatory for new dashboard work; `Card` only for chart wrappers and non-dashboard composables. `bg-dashboard-surface` only for the dashboard backdrop.
- No new hard-coded hex in `app/**` route components (chart palette constants and tenant brand colours excepted). No chart hard-codes a hex — use `lib/chart-theme.ts` / `lib/charts/registry.ts`.
- Interactive charts: tooltip + legend + keyboard alternative; non-interactive: `cursor="default"`. Touch targets ≥24×24 CSS px, ≥44×44 for primary actions.
- (Full normative doc: `docs/design-refresh/SYSTEM_RULES.md`.)

## Workflow

- `localhost` = working trunk; `main` = cherry-pick-only deploy target; no other branches; no direct commits to main; no force-push; no history rewrites on pushed commits. Conventional Commits. Smoke before cherry-picking feat/fix/refactor. If practice diverges from `BRANCHING.md`, fix the doc in the same commit.
- Tests run via `tsx --test` (node:test) + vitest config exists; check `package.json` scripts before assuming a runner. TS7/tsgo trialled and NOT adopted (baseline typescript@5.9.x).
- Xano-side changes that can't live in code (function-stack scripts) are documented in `XANO_SCRIPT_REFERENCE.md` — keep it current when touching Xano function stacks. Xano `input{}` blocks must declare fields explicitly; a `dblink` input block breaks JSON body parsing.
- `DATA_BACKEND` defaults to `xano`. Per-domain `DATA_BACKEND_<DOMAIN>` overrides when set. `shadow` serves Xano and must not alter user-visible payloads; `postgres` serves Supabase for wired domains only (reference → publishers/clients → kpi → …). KPI reads go through `lib/data/readKpi.ts`; writes stay Xano until T4. New domains opt in one PR at a time.
