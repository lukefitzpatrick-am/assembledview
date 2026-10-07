# DS-8 discovery (read-only)

`PageHeroTitleBlock` already uses 28/32/36 extrabold (`components/dashboard/PageHeroShell.tsx:28`) and has no full stop. `PageHeroShell` is already a `rounded-frame` `bg-card` with no watermark (`:56`). A source test asserts that (`tests/lib/mediaPlanEditorHeroTokens.test.ts:23`).

## Slice 8a — heroes and dashboards

- `PageHeroShell.tsx` — `punctuate` (default true, `withFullStop` on string titles) and `surface="ink"` for the campaign band. Shell stays a card.
- Entity titles pass `punctuate={false}`: `CampaignHeroBanner.tsx` (campaign name), `PublisherDetailClient.tsx:69` (publisher name), `PlanWizardHeader.tsx:61` (plan title), `TraffickingBuilder.tsx:728` (campaign name; page-title fallback "Trafficking" stays punctuated).
- `HeroBanner.tsx:121` "Welcome back, {client}" stays punctuated (page greeting).
- `MediaPlanEditorHero` forwards `punctuate` (default true) so list pages that already use it ("Campaigns", "Pacing", "Publishers", "Assembled Media Overview") gain a full stop without a second heading.
- `CampaignHeroBanner` leaves `PageHeroShell` for an ink band, no border. Status stays `CampaignStatusBadge` → `StatusPill`.
- `DashboardEntityCards.tsx:65` and `:121` primary gradient stripes removed (UI-5, dashboard cards).

Later slices (plans/pacing/finance, remaining routes, status/tables/utilities) follow the route table in `docs/superpowers/DISCOVERY-design-system-consolidation.md` section 1. Not started in this note's first edit.

## Slice 8d — status, tables, utilities

UI-3 top files (KNOWN-ISSUES): ForecastingPageClient, DashboardOverview, globals.css (token source, leave), KPIEditModal, edit/page.tsx, mediaplans/page.tsx, ParseReviewScreen, pacing-social and pacing-programmatic LineItemPacingTable, account/page.tsx.

Band map: on-track → tone action, ahead → insight, behind → attention, critical → critical (`lib/design/status.ts` PACING_UI_STATUS).

Tables named in the pack use custom sticky offsets, expand rows, or frozen columns. Class swap would move `z-20` / `bg-background` sticky headers. Skip the component swap.

Flat utilities: `bg-brand-dark`, `bg-highlight`, `bg-lime`, `bg-success`, `text-darkGrey`, `bg-error` and hover twins in `app/**` and `components/**`.

`copyForRowKpiStatus` `lib/pacing/kpi/computeKpiStatus.ts:150`.
