# Campaign dashboard layout (B1–B4)

Status: implemented (B1..B4)  
Date: 2026-09-15  
Scope: campaign MBA page compositor (`CampaignPageAssembly`) — Where we are, Channels at a glance, Delivery before The plan, honest KPI tiles and readable gantt labels.  
Brain: `docs/brain/MAP.md` §4 Client dashboards; `docs/brain/modules/dashboards-charts-exports.md` (Campaign MBA layout); `docs/brain/BLAST-RADIUS.md` rows for `CampaignStatusStrip` / `channelCoverage` and `CampaignPageAssembly` consumers; `docs/brain/INVARIANTS.md` (Connecting, null-KPI, hide impressions without delivery); `docs/brain/KNOWN-ISSUES.md` C-130 (delivered-in-bar), C-131 (no first-report-expected date).

Goal: the live campaign page matches the [BIC Client Dashboard Mock](../../av-review/CLIENT-DASHBOARD-layout-pack-2026-09-15.md) (prompt pack [CURSOR-PACK Part B](../../av-review/CURSOR-PACK-push-and-dashboard-2026-09-15.md)) without inventing dates or spend the warehouse does not hold.

## Shipped as B1..B4

| Prompt | What landed |
|---|---|
| B1 | `CampaignStatusStrip` — pill + `statusSentence` (a–d, first match); Delivered / Expected / Impressions / Time. Impressions hide when `hasDelivery` is false. `CampaignSummaryRow` not mounted. |
| B2 | `ChannelsAtAGlance` from `channelCoverage`. Statuses `reporting` / `connecting` / `not_started`; `no_source` excluded. Connecting = source exists, no PACING_FACT rows yet; caption "Awaiting first report" (C-131). Section hidden when there are no cards. |
| B3 | Section order: hero → Planned audience → Where we are → glance → admin Hours/KPI/insights → Delivery → Media plan → **The plan** (`SpendChartsRow`: donut + monthly stack, no tiles). One `/api/pacing/bulk`. |
| B4 | Null KPI ratios (not 0) + dashed `KpiTile`; shared-plan CPM caption; View rate `N% of impressions`; `wrapGanttLabel` 44×2 at `padL` 360; `Starts {d MMM}` on future-start bars; Weekly/Monthly + PNG admin-only. Delivered-in-bar not in the gantt tree (C-130). |

## Browser pass (before commit)

- `/dashboard/bic/BICAU006` as **admin**: strip, glance, Delivery, Media plan chrome, The plan.
- `/dashboard/bic/BICAU006` as **client-role**: no Hours / KPI pacing / insights; no Weekly/Monthly or Download PNG.
- `/dashboard/legal_super/LEGAL004` (legal004): Programmatic - OOH reporting (impressions, plays, real spend).
- A campaign with **no delivery**: strip hides Impressions; Channels at a glance does not render.
