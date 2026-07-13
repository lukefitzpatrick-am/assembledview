# DISCOVERY — Repo state audit: 2026-07-10

**Mode:** read-only. PowerShell only. Single permitted write: this file. Single permitted ref update: `git fetch origin` (Phase 1).

**Hard-stop check (Phase 0):** PASS — no modified/deleted tracked files. Untracked-only working tree.

**Concurrent-ref note (WARN, 95%):** During this run, checked-out `localhost` tip moved `c7b7ef7` → `3a2311f` → `651acf6` while porcelain stayed untracked-only. Evidence of another process rewriting/advancing the local branch tip. Working tree content was not mutated. Ahead/behind and HEAD ancestry conclusions use the final tip `651acf6` unless stated otherwise.

---

## Phase 0 — Snapshot

### 0.1 `git status --porcelain` (full)

```
?? .mcp.json
?? BILLING_ALTERED_FLAG_DISCOVERY.md
?? DISCOVERY-chart-tooltip-pattern.md
?? DISCOVERY-creative-delivery.md
?? DISCOVERY-gantt-label-overlap.md
?? DISCOVERY-repo-state-2026-07-10.md
?? DISCOVERY_production_container_map.md
?? DISCOVERY_production_issue_candidates.md
?? DISCOVERY_production_version_filter.md
?? FEE_ALIGNMENT_DISCOVERY.md
?? FEE_ALIGNMENT_DISCOVERY_2.md
?? KPI_TARGETS_DISCOVERY.md
?? PERF-DISCOVERY-2-CACHE-DESIGN.md
?? PERF-DISCOVERY-LOAD-SPEED.md
?? SEC-D2-api-surface-audit.md
?? SEC-D3-proxy-consumers.md
?? WIP-TRIAGE-2026-07-10.md
?? npm-audit-snapshot.json
```

**INFO (100%):** Zero `M` / `D` / staged entries. Hard-stop for modified/deleted outside `.agents/` does **not** apply.

### 0.2 `git branch -vv` (full, pre-fetch)

```
  hotfix/digital-video-edit-load 10dbccd [origin/hotfix/digital-video-edit-load: gone] refactor(influencers): adopt shared burst ops and stable _reactKey
  hotfix/integrations-save-load  bc77d37 [origin/hotfix/integrations-save-load: gone] fix: integration burst hydration — bursts fallback, deliverable recompute, one-shot guard
* localhost                      c7b7ef7 [origin/localhost: ahead 9] feat(mediaplans): format partial MBA amounts as AUD
  main                           91b3e4c [origin/main: ahead 7] perf(mediaplans): fetch trimmed version list for index page
```

### 0.3 `git log --oneline -10` (checked-out branch = localhost at c7b7ef7)

```
c7b7ef7 feat(mediaplans): format partial MBA amounts as AUD
00ccdf9 feat(billing): carry billingMode through persisted schedule parsing
ff64883 feat(security): require client MBA access on mediaplans/mba PUT and PATCH
9f79944 feat(gantt): styled hover tooltip revealing full sideline label text
d8e9452 fix(gantt): widen label gutter, clip labels, two-line wrap to stop bar overlap
58603b1 refactor(pacing): remove per-instance ttl cache from search campaigns pacing
75bfd30 feat(delivery): line-item grain KPI targets and burst-derived CPM/CPV expectations
f2bbb39 feat(kpi): line-item grain target map and burst-derived CPM/CPV targets
f8ba9a6 fix(delivery): normalise campaign_kpi ratio targets to match actuals scale
c683826 chore: add agent skills, KPI scripts, and discovery docs
```

### 0.4 Grouping

| Category | Result |
|----------|--------|
| Modified (`M`) under `.agents/` | None (no modified files at all) |
| Modified outside `.agents/` | None — hard stop not triggered |
| Untracked at repo root | All 18 `??` entries above (discovery docs, `.mcp.json`, `npm-audit-snapshot.json`, this findings file) |

**INFO (100%):** Safe to proceed.

---

## Phase 1 — The `main` ahead-of-origin anomaly

### 1.1 `git fetch origin` + post-fetch `git branch -vv`

Fetch succeeded (empty stdout). Post-fetch:

```
  hotfix/digital-video-edit-load 10dbccd [origin/hotfix/digital-video-edit-load: gone] ...
  hotfix/integrations-save-load  bc77d37 [origin/hotfix/integrations-save-load: gone] ...
* localhost                      3a2311f [origin/localhost: ahead 9] fix(mediaplans): format partial MBA amounts as AUD
  main                           91b3e4c [origin/main: ahead 7] perf(mediaplans): fetch trimmed version list for index page
```

| Ref | Ahead/behind change after fetch |
|-----|---------------------------------|
| `main` vs `origin/main` | Still **ahead 7** — unchanged |
| `localhost` vs `origin/localhost` | Still **ahead 9** — tip SHA changed (`c7b7ef7`→`3a2311f`) concurrent with fetch window |

**INFO (100%):** Fetch did not absorb the 7 local `main` commits onto `origin/main`.

### 1.2 `git log --oneline origin/main..main` (the 7)

| SHA | Subject | Author date |
|-----|---------|-------------|
| `91b3e4c` | perf(mediaplans): fetch trimmed version list for index page | 2026-07-06 11:59:06 +1000 |
| `9ee57a1` | chore(deps): npm audit fixes for transitive advisories | 2026-07-03 09:24:48 +1000 |
| `4b969cc` | chore(deps): security bumps for direct dependencies | 2026-07-03 09:15:15 +1000 |
| `e77ed27` | chore(scripts): fix no-op replacements in social channel build | 2026-07-03 09:07:19 +1000 |
| `1bcf20b` | fix(security): literal format strings in version helper | 2026-07-03 09:07:19 +1000 |
| `3258ac9` | fix(security): linear-time parsing in scopes-of-work pdf route | 2026-07-03 09:07:12 +1000 |
| `afa8cf9` | fix(security): validate MBA input and pin upstream host in spend routes | 2026-07-03 09:06:27 +1000 |

`git rev-list --count origin/main..main` → **7**.

### 1.3 `git branch --contains <SHA>` (each of the 7)

Every SHA reported **only**:

```
  main
```

None of `localhost`, `hotfix/digital-video-edit-load`, or `hotfix/integrations-save-load` contain these SHAs.

### 1.4 Patch equivalence

**`git cherry origin/localhost main`** — all entries `+` (including the 7 ahead SHAs plus further main-only history such as knowledge/dashboard commits). Meaning: **no patch-equivalent counterpart** on `origin/localhost`.

**`git cherry origin/main main`** — all 7 are `+`. Meaning: **not patch-equivalent to anything already on `origin/main`**.

**`git log --oneline localhost..main`** (non-empty) — confirms local `main` is not an ancestor subset of current `localhost`; unique stack includes the 7 plus earlier main-only commits.

### 1.5 Last commit on local `main`

```
2026-07-06 11:59:06 +1000 Luke Fitzpatrick
```

### 1.6 Conclude

| Option | Fit |
|--------|-----|
| (a) Old local merge of localhost work later pushed differently | **No** — cherry vs `origin/main` and vs `origin/localhost` are all `+`; SHAs only on `main` |
| (b) Unpushed unique work | **Yes** |
| (c) Something else | N/A |

**BLOCKER (98%):** The 7 commits are **unique unpushed work sitting only on local `main`**. They are **not** duplicates of `localhost` history by SHA or by patch-id. Triage before any push of `main` (or before any reset that would lose them).

**What would raise to 99%+:** `git show` / content review of each of the 7 against production concern + explicit Luke decision to keep vs cherry-pick onto `localhost` vs discard.

---

## Phase 2 — Hotfix branch cleanup inventory

### `hotfix/digital-video-edit-load`

| Check | Output |
|-------|--------|
| `git log --oneline localhost..<branch>` | *(empty)* |
| `git cherry localhost <branch>` | *(empty)* |

**INFO (99%):** Fully contained in current `localhost` (no unique commits / no unique patches). Safe to delete locally — Luke's call; **not deleted** this run.

### `hotfix/integrations-save-load`

| Check | Output |
|-------|--------|
| `git log --oneline localhost..<branch>` | *(empty)* |
| `git cherry localhost <branch>` | *(empty)* |

**INFO (99%):** Fully contained in current `localhost`. Safe to delete locally — Luke's call; **not deleted** this run.

Both remotes show `: gone` (already deleted on origin).

---

## Phase 3 — DV360: current STG_PACING contract or legacy Pattern A?

### 3.1 Reference contract (`sql/snowflake/pacing/10_stg_meta_daily.sql`)

Canonical 14 columns / order (comment + SELECT):

1. `DELIVERY_DATE`
2. `PLATFORM`
3. `ACCOUNT_ID`
4. `CAMPAIGN_ID`
5. `CAMPAIGN_NAME`
6. `GROUP_ID`
7. `GROUP_NAME`
8. `GROUP_TYPE`
9. `SPEND`
10. `IMPRESSIONS`
11. `CLICKS`
12. `CONVERSIONS`
13. `REVENUE`
14. `VIEW_THROUGH_CONVERSIONS`

Schema: **`ASSEMBLEDVIEW.STG_PACING`**.

### 3.2 DV360 views vs contract

| Column / attribute | STG reference | `VW_STG_DV360_PACING` | `VW_PACING_DV360` |
|--------------------|---------------|------------------------|-------------------|
| Schema | `STG_PACING` | **`MART`** | **`MART`** |
| Date | `DELIVERY_DATE` | `DATE_DAY` | `DATE_DAY` |
| Platform | `PLATFORM` | *(absent — media_type instead)* | `CHANNEL` (display labels) |
| Account | `ACCOUNT_ID` | *(absent; advertiser_name)* | *(absent; campaign_name=advertiser)* |
| Campaign id/name | `CAMPAIGN_ID` / `CAMPAIGN_NAME` | *(absent / advertiser_name)* | *(absent / CAMPAIGN_NAME)* |
| Group id/name/type | `GROUP_*` | `LINE_ITEM_NAME` (+ insertion_order) | `LINE_ITEM_*` / `ENTITY_*` |
| Spend | `SPEND` | `AMOUNT_SPENT` | `AMOUNT_SPENT` |
| Impressions/Clicks | same names | same | same |
| Conversions | `CONVERSIONS` | `RESULTS` | `RESULTS` |
| Revenue / VTC | present | **absent** | **absent** |
| Extra columns | — | `ADVERTISER_*`, `MEDIA_TYPE`, `VIDEO_3S_VIEWS`, Fivetran ids | `VIDEO_3S_VIEWS`, sync timestamps |

**WARN (98%):** Column list, order, and schema **do not match** the current STG_PACING contract. This is legacy **Pattern A** (MART channel-fact shape), not the 14-column STG union arm.

### 3.3 `FACT_DELIVERY_DAILY` UNION arms (`12_fact_delivery_daily.sql`)

```sql
SELECT * FROM ASSEMBLEDVIEW.STG_PACING.V_GOOGLE_ADS_AD_GROUP_DAILY
UNION ALL
SELECT * FROM ASSEMBLEDVIEW.STG_PACING.V_META_DAILY
UNION ALL
SELECT * FROM ASSEMBLEDVIEW.STG_PACING.V_META_CAMPAIGN_DAILY;
```

**INFO (100%):** **No DV360 source** in the UNION ALL set.

### 3.4 App-side consumers (`dv360` string hits)

| File | Role |
|------|------|
| `lib/pacing/dv360/dv360Pacing.ts` | Type-only `Dv360DailyRow` export |
| `lib/delivery/programmatic/programmaticCompute.ts` | **Live** — imports type; normalize/map/summarize DV360 rows |
| `app/api/pacing/programmatic/display/route.ts` | **Live** — queries `ASSEMBLEDVIEW.MART.PACING_FACT` |
| `app/api/pacing/programmatic/video/route.ts` | **Live** — same |
| `components/dashboard/delivery/channels/programmaticAdapterShared.ts` | Live delivery UI adapter |
| `components/dashboard/delivery/channels/types.ts` | Types |
| `app/dashboard/[slug]/[mba_number]/page.tsx` | Dashboard consumer |
| `app/knowledge/platforms/page.tsx` | Knowledge copy |
| `components/AddClientForm.tsx` / `EditClientForm.tsx` | Client platform labels |
| Multiple `lib/**/__tests__/**` | Test fixtures mentioning platform |

**Import of `dv360Pacing`:** only `programmaticCompute.ts` (type import). Not orphaned — type feeds live programmatic compute / API routes.

### 3.5 Other SQL mentioning dv360

- `sql/snowflake/mart/views/vw_stg_dv360_pacing.sql`
- `sql/snowflake/mart/views/vw_pacing_dv360.sql`
- `sql/snowflake/mart/tasks/tsk_refresh_pacing_fact.sql` — `MERGE … PACING_FACT` **from** `VW_PACING_DV360`

### 3.6 `sql/snowflake/mart/README.md`

Mentions: `TSK_REFRESH_PACING_FACT MERGE PACING_FACT <- VW_PACING_DV360 (+ programmatic)`.

### 3.7 Conclude

**(b) Legacy Pattern A needing rebuild** to join the STG_PACING → `FACT_DELIVERY_DAILY` path — with a **partial hybrid** at the app layer: app still reads **`MART.PACING_FACT`** fed by Pattern A views, while the new mart pacing fact has **no DV360 arm**.

**Reusable (INFO, 90%):**

- Fivetran source mapping knowledge in `VW_STG_DV360_PACING` (table `GOOGLE_DISPLAY_AND_VIDEO_360.DV_360_PACING`, spend/video field comments)
- Channel labeling logic in `VW_PACING_DV360` (`Programmatic - Display/Video`)
- App `Dv360DailyRow` + `programmaticCompute` / display+video routes (UI contract) until a STG rebuild lands

**Not reusable as-is for FACT_DELIVERY_DAILY:** MART column names/order/types; revenue/VTC absent; schema placement.

**Confidence on (b)/(hybrid):** **96%**. To reach 99%: confirm Snowflake still hosts deployed MART views vs only repo DDL, and confirm whether a draft `STG_PACING.V_DV360_*` exists only in Snowflake (absent from repo SQL search).

---

## Phase 4 — In-flight build verification

### 4a. KPI Build 2b (adapter wiring)

| Location | Role |
|----------|------|
| `lib/kpi/lineItemKpiTargets.ts` | **Defines** `buildLineItemKpiTargetMap`, `deriveRateTargetFromBursts`, `getLineItemKpiRow` |
| `app/dashboard/.../CampaignPageAssembly.tsx` | **Invokes** `buildLineItemKpiTargetMap`; passes `lineItemTargets={lineItemTargets}` |
| `components/dashboard/delivery/channels/programmaticAdapterShared.ts` | **Invokes** `deriveRateTargetFromBursts` + `getLineItemKpiRow` |
| `components/dashboard/delivery/channels/socialAdapterShared.ts` | Same |

Tied to commits in HEAD ancestry: `f2bbb39` / `75bfd30`.

**Verdict: LANDED (97%).** Delivery adapters call the Build 2a helpers; assembly builds and passes the map.

### 4b. SEC Wave 1 (catch-all proxy allowlisting)

Catch-all proxies found:

- `app/api/media-details/[...path]/route.ts` — open proxy via `xanoUrl(path, ...)`, **no path allowlist**
- `app/api/media_plans/[...path]/route.ts` — same pattern, **no path allowlist**

Search for `ALLOWED_PATHS|allowedPaths|PATH_ALLOWLIST|isPathAllowed|pathAllowlist` under `app/lib/components`: **no hits**.

Only unrelated allowlist: `ADMIN_EMAIL_ALLOWLIST` in `app/api/admin/clients/refresh-slug/route.ts`.

**Verdict: NOT PRESENT (98%).** Wave 1 path allowlisting has not landed on the catch-all proxies.

### 4c. SEC Wave 4 (`requireAdmin` + `checkClientMbaAccess`)

**Routes with `checkClientMbaAccess`:**

| Route | Methods guarded |
|-------|-----------------|
| `app/api/mediaplans/mba/[mba_number]/route.ts` | **GET, PUT, PATCH** |
| `app/api/kpis/campaign/route.ts` | **GET** (import used in GET only; POST/PATCH/DELETE present without this check in the scanned markers) |
| `app/api/pacing/bulk/route.ts` | **POST** |

**S1b-2 three routes — expected “NOT yet wired” vs evidence:**

| Route / method | Has `checkClientMbaAccess`? |
|----------------|----------------------------|
| `mediaplans/mba` GET | **YES** (contrary to “expected NOT yet”) |
| `kpis/campaign` GET | **YES** |
| `pacing/bulk` POST | **YES** |

**WARN (95%):** On current `localhost` tip these three **are wired**. Pre-run expectation that S1b-2 was still open is **stale relative to HEAD**. (PUT/PATCH MBA access also present — aligns with commit `ff64883`.)

**Routes with `requireAdmin`:**

- `app/api/admin/client-hub/route.ts`
- `app/api/admin/clients/refresh-slug/route.ts`
- `app/api/admin/users/route.ts`
- `app/api/pacing/admin/orphans/route.ts`
- `app/api/pacing/admin/orphans/assign/route.ts`
- `app/api/pacing/admin/orphans/live-line-items/route.ts`

**Verdict: LANDED for the named S1b-2 trio + MBA mutations (96%); requireAdmin present on listed admin/orphan routes.** Full “Wave 4 complete for every mutation handler” was **not** exhaustively proven — would need a full mutation-route inventory.

### 4d. Billing Build 2a (bucket-mode schema)

**`billingMode` files:** types, `applyBillingLineMode`, `buildBillingSchedule`, `parsePersistedBillingScheduleToMonths`, seed/indicators/tests, spreadsheet callbacks/context, edit page.

Schema evidence (`lib/billing/types.ts`):

```ts
billingMode?: "auto" | "manual";
```

Consumed through persist-parse (`00ccdf9`), apply helpers, and UI.

**`bucket` hits:** `CostBucket = "fee" | "adServing" | "production"` in spreadsheet callbacks — **not** a `billingMode` value.

**Verdict: LANDED for auto/manual billingMode persist+consume (97%).** No `"bucket"` billingMode enum member found. If Build 2a specifically meant a third **bucket billing mode**, that piece is **NOT PRESENT** — label **PARTIAL** under that narrower reading (confidence on naming: **85%** until Build 2a brief is re-read; evidence to 95%+: the issued Build 2a ticket text).

### 4e. Gantt commits

| Check | Result |
|-------|--------|
| `d8e9452`, `9f79944` ancestors of HEAD? | **Yes** (`merge-base --is-ancestor` exit 0) |
| Files changed | Both touch `components/charts/system/domain-charts.tsx` |
| `useId` | Present: `React.useId()` → `gantt-gutter-clip-…` |
| HEAD region | Tip `651acf6`; gantt commits sit immediately under security/billing MBA-format commits (`… → 9f79944 → d8e9452`) |
| Smoke path | **`components/charts/system/domain-charts.tsx`** — export `MediaGanttChart` |

Legacy wrapper also exists at `app/dashboard/[slug]/[mba_number]/components/MediaGanttChart.tsx` (older migrate commit); **implementation under smoke is `domain-charts.tsx`**.

**Verdict: LANDED (99%).**

---

## Phase 5 — Gate check

### 5.1 `npx tsc --noEmit`

Exit code **0**. No errors quoted.

**INFO (100%):** Gate clean.

### 5.2 Re-run `git status --porcelain`

Identical to Phase 0.1 (same 18 untracked paths; no `M`/`D`). This findings file remains `??` (expected).

**INFO (100%):** Working tree unmutated by this discovery run.

**WARN (95%):** Branch tip of `localhost` **did** move during the session (`c7b7ef7`→`651acf6`) via concurrent ref update — not reflected in porcelain, but means log SHAs in Phase 0.3 are stale vs final HEAD. Final HEAD used for Phase 4/5: `651acf6`.

---

## Verdict table

| # | Question | Verdict | Confidence | Severity |
|---|----------|---------|------------|----------|
| 1 | What are main's 7 ahead commits, and are they duplicated in localhost? | **7 unique SHAs on local `main` only** (security/deps/perf stack listed in §1.2). **Not** duplicated on `localhost` by SHA or `git cherry` patch-id. Classify **(b) unpushed unique work**. | 98% | **BLOCKER** |
| 2 | Hotfix branches fully merged? | **Yes** — both `hotfix/digital-video-edit-load` and `hotfix/integrations-save-load` empty vs `localhost` (log + cherry). Remotes already gone. | 99% | **INFO** |
| 3 | DV360 code: current contract, Pattern A, or hybrid? What's reusable? | **Legacy Pattern A (MART)** + **app hybrid** still on `MART.PACING_FACT`. **Not** on STG_PACING 14-col contract; **absent** from `FACT_DELIVERY_DAILY` UNION. Reuse: source-field comments, channel labels, app `Dv360DailyRow`/programmatic routes. | 96% | **WARN** |
| 4a | KPI Build 2b landed? | **LANDED** — map built in `CampaignPageAssembly`; adapters call `deriveRateTargetFromBursts` / `getLineItemKpiRow`. | 97% | **INFO** |
| 4b | SEC Wave 1 landed? | **NOT PRESENT** — catch-all proxies exist without path allowlisting. | 98% | **WARN** |
| 4c | SEC Wave 4 landed / S1b-2 three routes still unwired? | **Named trio ARE wired** (`checkClientMbaAccess` on mediaplans GET, kpis GET, pacing bulk POST). MBA PUT/PATCH also wired. `requireAdmin` on listed admin/orphan routes. Preconception “still unwired” is **false on HEAD**. | 96% | **INFO** (stale expectation **WARN**) |
| 4d | Billing 2a landed? | **LANDED** for `billingMode: "auto"|"manual"` schema + persist/UI. No `"bucket"` mode enum; `CostBucket` is unrelated fee taxonomy. If ticket meant a bucket mode, treat as **PARTIAL**. | 97% (85% if strict “bucket-mode” naming) | **INFO** / naming **WARN** |
| 4e | Gantt commits at HEAD, component path recorded? | **Yes** — `d8e9452` + `9f79944` in HEAD ancestry; smoke file **`components/charts/system/domain-charts.tsx`** (`MediaGanttChart`, `useId`). | 99% | **INFO** |
| 5 | tsc zero errors, tree unmutated? | **PASS** — `tsc --noEmit` exit 0; porcelain identical to Phase 0. (Branch tip moved concurrently — see WARN.) | 100% (tree) / 95% (ref stability) | **INFO** / concurrent-ref **WARN** |

---

## Overall summary

Local `main`’s 7-ahead stack is **real unique unpushed work**, not a phantom duplicate of `localhost` — **triage before any main push/reset**. Hotfix branches are already fully contained in `localhost`. DV360 remains **Pattern A / MART**, not the STG_PACING contract, while the app still consumes `PACING_FACT`. On the in-flight builds: **KPI 2b**, **billingMode auto/manual**, **Gantt**, and the **S1b-2 MBA-access routes are landed** on current `localhost`; **SEC Wave 1 proxy allowlisting is not**. Typecheck is clean and the working tree was not mutated by this audit; note concurrent `localhost` tip rewrites during the run.
