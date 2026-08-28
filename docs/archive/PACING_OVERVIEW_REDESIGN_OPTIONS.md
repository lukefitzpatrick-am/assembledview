# Pacing Overview redesign — discovery & options

Read-only discovery for handoff §7 item 11 (*All-channel pacing Overview redesign*).  
Grounds the build once Luke’s UAT wishes arrive. **No code changes in this artifact.**

Date: 2026-07-11 · Branch context: post-P1 (Programmatic / Ad Serving / Direct tabs + 4h cache live)

---

## 1. Current state

### What Overview claims vs what it loads

| Surface | Path | Claim in UI | Actual data |
|---------|------|-------------|-------------|
| Overview tab | `/pacing/overview` | “Underperforming line items **across all clients** in your scope” | **Search line items only** — same payload as Search tab |
| Copy nuance | `OverviewClient` subtitle | “all clients” (scope), not “all channels” | Still misleading if users read “portfolio overview” |

Overview does **not** include Social, Programmatic (DV360/Taboola), Ad Serving (CM360), or Direct after P1. Those channels have dedicated tabs; Overview was never rewired.

### Data path (quoted)

**Page → client → API → cache → composer**

```
app/pacing/(shell)/overview/page.tsx
  → OverviewClient (isAdmin from Auth0 roles)
    → GET /api/pacing/campaigns
      → getCachedSearchPacingRows(asOfDate, allowedClientSlugs)
        → fetchSearchPacingCampaignRows
          → Xano: live media_plan_master + current version + media_plan_search
          → Snowflake: SEARCH_PACING_FACT (ad-group grain → TS rollup)
```

**API** (`app/api/pacing/campaigns/route.ts`):

```ts
/**
 * GET /api/pacing/campaigns
 *
 * Returns the list of live Search line items composed from Xano.
 * Snowflake-sourced spend/KPI fields and three-level hierarchy populated in Part 2.
 */
const rows = await getCachedSearchPacingRows(asOfDate, allowedClientSlugs);
return NextResponse.json({ asOfDate, rows });
```

**Client** (`app/pacing/(shell)/overview/OverviewClient.tsx`):

- Fetches `/api/pacing/campaigns` once on mount (`useEffect` deps `[]`).
- Types rows as `SearchPacingCampaignRow[]`.
- Computes status counts (`on-track` / `ahead` / `behind` / `no-data` + `kpi-pending`).
- **Renders only `behindRows`** in `LineItemPacingTable` from `@/components/pacing-search`.
- KPI edit callback mirrors Search tab (`onRowKpiTargetsUpdated`).

**Adapters / components**

| Role | Module |
|------|--------|
| Shell tabs | `components/pacing/PacingShell.tsx` — Overview first among six (+ Admin) |
| Filter chrome | `PacingFilterToolbar` in shell — **OverviewClient does not subscribe**; filters do not change Overview fetch/payload |
| Status cards | Local `StatusSummary` in `OverviewClient` |
| Table | `components/pacing-search/LineItemPacingTable.tsx` (same as `/pacing/search`) |
| Spend maths | `lib/pacing/maths` via search composer (`computePacing` → 4-state pill) |
| KPI | `computeRowKpiStatus` / search KPI targets from Xano `campaign_kpi` |

### Platforms that feed Overview today

| Platform / channel | In Overview? | Where it lives instead |
|--------------------|--------------|------------------------|
| Search (`SEARCH_PACING_FACT`) | **Yes — only feed** | Also `/pacing/search` |
| Meta / TikTok (`SOCIAL_PACING_FACT`) | No | `/pacing/social` |
| DV360 + Taboola (`PACING_FACT` programmatic display/video) | No | `/pacing/programmatic` |
| CM360 Ad Serving (`PACING_FACT` channel `ad-serving`, spend≡0) | No | `/pacing/ad-serving` |
| Direct fixed-cost (`FIXED_COST_*` facts) | No | `/pacing/direct` |

**Verdict:** Overview is still **search-era**. P1 shipped Taboola/CM360/Direct (and Programmatic tab) as **sibling tabs**, not into Overview. Ava’s `get_pacing_snapshot` already fans out all five caches; the Overview UI does not.

### Aggregation grain

| Layer | Grain |
|-------|--------|
| Snowflake search facts | Ad-group × day (`SEARCH_PACING_FACT`) |
| Composer output | **One row per Xano search line item**, with nested `platformCampaigns` → `adGroups` |
| Overview UI | **Line-item** status counts; table shows **behind** line items only (not client rollup, not channel mix) |
| Scope | Live campaigns in date window × tenant `allowedClientSlugs` (admin = unscoped) |

---

## 2. Gap table — what each tab shows that Overview does not roll up

Overview today ≈ filtered Search behind-list. Gaps below are relative to that.

| Tab | Route / API | What it shows | Missing from Overview | Dangerous if naively rolled into $ totals |
|-----|-------------|---------------|----------------------|---------------------------------------------|
| **Overview** | `/pacing/overview` → `/api/pacing/campaigns` | Search behind line items + search status counts | (baseline) | N/A |
| **Search** | same API as Overview | Full search line-item table (all statuses), platform→ad-group drill, KPI edit | Full (non-behind) search inventory; same drill if Overview stays behind-only | Safe with other spend channels **only if** you sum search spend alone or label channels |
| **Social** | `/api/pacing/social-campaigns` | Meta + TikTok live social line items; spend pacing; social table | Entire social portfolio status/spend/KPIs | Spend is real platform spend — OK to sum with Search/Programmatic **if** channel-labelled |
| **Programmatic** | `/api/pacing/programmatic-campaigns` | progDisplay/Video/Bvod/Audio/Ooh; DV360 + Taboola via `PACING_FACT`; `platformLabel` | Entire programmatic portfolio | Taboola rides **display** channel filter — must not double-count if also summing raw fact rows |
| **Ad Serving** | `/api/pacing/ad-serving-campaigns` | CM360 verification: imps/clicks/CTR/video/results; status `serving` \| `no-data`; deliverable progress | Delivery verification across digi display/video/audio/BVOD | **ZERO-$ LAW** — see below |
| **Direct** | `/api/pacing/direct-campaigns` | Campaign-grouped fixed-cost rows; reported vs actual; burst statuses; daily series + square-up | Fixed-cost finance pacing | **Reported ≠ platform actual**; square-up — see below |

### Zero-$ semantics — CM360 (Ad Serving)

Flagged in code (do not ignore on Overview redesign):

- API comment: *“Delivery counts only — no spend pacing (zero-spend law).”*
- Types (`lib/pacing/ad-serving/types.ts`): *“no budget variance, no computePacing spend status, no $ columns.”*
- Composer: never calls `computePacing` / `computeStatus`; status is delivery-based only.
- Staging decision (handoff / outstanding tasks): CM360 view emits **`SPEND = 0` by design**.
- Dashboard adapter: suppress spend ProgressCards; never treat spend=0 as `no_delivery`.

**Where naive all-channel $ totals go wrong**

1. Summing `AMOUNT_SPENT` / `spendToDate*` across rows that include CM360 → understates “true” media cost while inflating “behind / no delivery” if spend status maths is applied.
2. Including CM360 line items in a unified “budget remaining” or “% paced” $ column → fake zeros.
3. Client-level “total spend” that mixes CM360 with DV360 for the same digital line → verification spend (0) + buying-platform spend (real) if both rows are present without channel rules.

**Safe Overview treatment for CM360:** counts / delivery progress / “serving” badges only; **exclude from $ rollups**; never run spend-status pills.

### Fixed-cost / square-up nuances — Direct

From `lib/pacing/direct/types.ts` + `sp_refresh_fixed_cost_reported_daily`:

| Concept | Meaning |
|---------|---------|
| `REPORTED_SPEND` | Finance-smoothed: even daily for `buy_type=fixed_cost`; delivery-shaped with 0.5–1.3 caps for cpm/cpc/cpv/cpa |
| `ACTUAL_PLATFORM_SPEND` | `SUM(AMOUNT_SPENT)` from platform pacing facts |
| `VARIANCE` | reported − actual (positive ⇒ reported ahead of platform) |
| Square-up | Final-day rounding when burst complete: remaining budget dumped onto last day (`IS_SQUAREUP_DAY`, `capApplied = 'squareup'` / `fixed_cost_rounding`) |
| Status vocab | `pending` \| `in_progress` \| `completed` \| `completed_over` \| `completed_under` \| `mixed` — **not** the Search/Social ahead/behind pills |

**Where naive all-channel $ totals go wrong**

1. Adding Direct **reported** spend to Search/Social/Programmatic **platform** spend → mixes two ledgers (finance schedule vs platform actuals).
2. Adding Direct **actual** into the same bucket as Search spend → can be OK as “platform actuals” **only if** those line items are excluded from Search/Programmatic composers (avoid double-count when a line is/was fixed-cost).
3. Mid-burst **reported** series are intentionally smooth; square-up days create a cliff on the last day — sparkline/% complete against reported looks fine; treating reported daily as “delivery pace” for an all-channel chart misleads.
4. Status cannot be mapped 1:1 onto Overview’s ahead/behind chips without a product rule.

**Safe Overview treatment for Direct:** separate card/column for reported vs actual / variance; or status-only count of `completed_under` / `in_progress`; **do not** fold reported $ into a single portfolio spend KPI without an explicit Luke rule.

---

## 3. Cache + perf

### How the 4h cache works

`lib/pacing/campaigns/pacingRowsCache.ts`:

```ts
const REVALIDATE_SECONDS = 14_400 // 4h
// Keys: ["pacing-rows", channel, asOfDate, scopeKey, …]
// Tag: PACING_CAMPAIGNS_TAG = "pacing-campaigns"
```

| Getter | Used by |
|--------|---------|
| `getCachedSearchPacingRows` | Overview + Search + Ava |
| `getCachedSocialPacingRows` | Social + Ava |
| `getCachedProgrammaticPacingRows` | Programmatic + Ava |
| `getCachedAdServingPacingRows` | Ad Serving + Ava |
| `getCachedDirectPacingRows` | Direct + Ava (`includeHistorical` in key) |

- Scope key: `"all"` (admin/unscoped) or sorted client slugs.
- Cold miss: full Xano resolve + Snowflake hydrate for that channel.
- Warm hit: shared across tabs and Ava within the same `(channel, asOfDate, scope)`.
- Routes remain `force-dynamic` / `maxDuration = 60`; cache is **data** cache via `unstable_cache`, not HTTP CDN.

Separate short TTL: in-process `lib/pacing/pacingCache.ts` (~60s, `PACE_CACHE_SECONDS`) for some Snowflake list routes (meta/tiktok/display/video) — **not** the campaigns Overview path.

### Cost of a heavier Overview

| Design | Cache behaviour | Cold cost | Warm cost |
|--------|-----------------|-----------|-----------|
| **Today** | 1 key (search) | 1× search composer | ~JSON serialize of search rows |
| **Light (summary cards)** | `Promise.all` of 5 getters (same as Ava `get_pacing_snapshot`) | Up to **5×** composers if all cold; often warmer if user already visited other tabs | 5 parallel cache reads; response payload grows |
| **Medium (unified table)** | Same 5 fetches + merge/normalize in route or client | Same cold warehouse/Xano; larger JSON; heavier client sort/filter | CPU on merge + render |
| **Large (client rollup)** | Same 5 + aggregation by `clientName` / slug | Same fetch; extra aggregate pass; smaller table if rolled up | Aggregation cheap vs Snowflake |

**Notes**

- Hitting Overview after visiting Search alone does **not** warm Social/Programmatic/Ad Serving/Direct keys.
- First all-channel Overview load after deploy/revalidate can approach **five** 60s-budget composers in parallel — watch Vercel duration and Snowflake concurrency.
- Prefer **reusing cached getters** (do not new-query Snowflake from Overview). Optional: thin `/api/pacing/overview` that only returns status counts + behind samples to shrink payload.
- Filter toolbar still unused by Overview — wiring filters client-side after multi-fetch is cheap; pushing filters into cache keys multiplies key cardinality (avoid unless required).

---

## 4. Options (2–3)

### Option A — Light: channel summary cards on current layout

**Effort: S** · **Risk: Low**

Keep behind-search table; add a row of cards (Search / Social / Programmatic / Ad Serving / Direct) with per-channel status counts (and non-$ metrics for CM360/Direct).

| | |
|--|--|
| **Reusable** | All five `getCached*` getters; Ava fan-out pattern; existing status tokens; `StatusSummary` UI pattern |
| **New** | Overview fetch orchestration (`Promise.all`); small card components; CM360/Direct count semantics (not spend pills) |
| **Luke must answer** | Q1–Q3, Q7 below |

### Option B — Medium: unified all-channel table with per-platform drill

**Effort: M** · **Risk: Medium**

One table: channel column + normalized status + optional spend where allowed; drill to existing channel tables or nested breakdowns. Behind-filter becomes cross-channel “needs attention.”

| | |
|--|--|
| **Reusable** | Channel composers + tables as drill targets; search/social/programmatic row shapes (similar pacing pills); cache layer |
| **New** | Normalized row DTO; status mapping for Direct + Ad Serving; column set that hides $ for CM360; merge API or client merge; filter wiring |
| **Luke must answer** | Q1–Q6, Q8–Q9 |

### Option C — Larger: client-first rollup

**Effort: L** · **Risk: Medium–High**

One row per client (or MBA): channel mix indicators, attention counts, optional spend **only** from Search+Social+Programmatic (explicit exclusion list). Expand → channel slices → line items.

| | |
|--|--|
| **Reusable** | Same five caches; client slug helpers; shell filters for client scope |
| **New** | Rollup model; UX for expand/drill; rules engine for “which $”; possibly dedicated overview API for slim payloads |
| **Luke must answer** | All questions especially Q4–Q6, Q10–Q11 |

### Effort / risk snapshot

| Option | Effort | Risk | Main risk |
|--------|--------|------|-----------|
| A Light cards | S | Low | Users still open other tabs for detail; copy vs expectation |
| B Unified table | M | Medium | Status vocab clash; accidental $ on CM360/Direct |
| C Client rollup | L | Med–High | Wrong portfolio $; performance on admin unscoped cold load |

---

## 5. Questions for Luke (merge with UAT wishes)

1. Should Overview mean **all channels** or stay **attention inbox** (behind items only) with channel badges?
2. Default view: **behind-only**, **all statuses**, or **configurable**?
3. Preferred option for first ship: **A / B / C**, or A then B?
4. May any Overview KPI sum **dollars across channels**? If yes, which set: Search+Social+Programmatic only?
5. For Direct on Overview: show **reported**, **actual**, **variance**, or **status counts only**?
6. Confirm CM360 never appears in any Overview **$** total or spend-status pill (recommended: yes).
7. Should shell **filters** (client / media type / status / search) apply to Overview after redesign?
8. Single “behind” definition across channels, or channel-native labels (e.g. Direct `completed_under`, CM360 `no-data`)?
9. Drill behaviour: deep-link to channel tabs vs inline expand?
10. Admin unscoped Overview: full portfolio OK, or require client filter before multi-channel fetch?
11. Priority attention: under-pacing spend, missing KPIs, CM360 not serving, Direct variance — rank for the default sort?
12. Any UAT wish that Overview should replace daily Slack/email pacing summaries (ties to F5 later)?

---

## Source index (traceability)

| Concern | Primary paths |
|---------|----------------|
| Overview UI | `app/pacing/(shell)/overview/OverviewClient.tsx`, `page.tsx` |
| Overview/Search API | `app/api/pacing/campaigns/route.ts` |
| 4h cache | `lib/pacing/campaigns/pacingRowsCache.ts` |
| Search composer | `lib/pacing/campaigns/fetchSearchPacingCampaignRows.ts` |
| Social / Programmatic / Ad Serving / Direct APIs | `app/api/pacing/{social,programmatic,ad-serving,direct}-campaigns/route.ts` |
| CM360 zero-$ | `lib/pacing/ad-serving/types.ts`, `fetchAdServingPacingCampaignRows.ts`, dashboard `adServingAdapter.ts` |
| Direct reported/squareup | `lib/pacing/direct/types.ts`, `sql/snowflake/mart/procedures/sp_refresh_fixed_cost_reported_daily.sql` |
| All-channel fan-out precedent | `lib/ava/tools/getPacingSnapshot.ts` |
| Handoff queue item | `HANDOFF_2026-07-11.md` §7 item 11 |

**Hard stop:** not triggered — Overview sources traced end-to-end to search-only cache + composer.
