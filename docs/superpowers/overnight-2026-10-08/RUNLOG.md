# Overnight run 2026-10-08 — summary

- DS-6 DONE e9215699
- DS-7 DONE cba5538f
- DS-8 DONE f528a067 (8a), ddf90cb1 (8b), a5cda8b6 (8c), 12202faf (8d)
- DS-E DONE f631910c
- DS-10 DONE 8a16677a
- DS-9 DONE 09ae59b7
- None parked.

Final checks (2026-10-07 22:24 local): typecheck 0, lint 0 (same warning set as A2), test:all exit 1 in 564s, 117/121 suites. The four failures are the A2 baseline (`test:client-server-only`, `test:campaign-dashboard-range` SpendChartsRow snapshot, `test:social-delivery` distinct hex 5 vs 9, `test:finance-sections` uncovered `/design-system`, `/data-deletion`, `/privacy`). No new failures. The suite count dropped by one because DS-9 removed `test:client-dashboard`. `npm run build` exit 0.

## Morning smoke (route order)

1. Sign out, open `/`. Ink left panel, three arches, one h1 "Sign in to AssembledView.", lime "Log in", forest-outline "Reset password". Favicon in the tab. Hard refresh shows BrandLoading ("Loading AssembledView." / "Taking you to your dashboard.").
2. `/dashboard`. Title "Assembled Media Overview." Key metrics icons are muted. "Campaigns & scope data." has a full stop. Live campaigns panel and campaign cards have no coloured top bar. Client mark sits next to the client name.
3. Client dashboard (`/dashboard/[slug]` and `/client/[slug]`). Greeting keeps a full stop. Entity cards have no coloured stripe. Spend charts use forest / context, not the client colour. Open the four client slide-overs: mark in the header, no gradient stripe.
4. Campaign page. Black hero band, campaign name has no full stop, ClientMark, status pill unchanged, elapsed bar is one forest fill. Delivery charts follow the chart theme.
5. `/mediaplans`, create, and edit. Page title has a full stop. Plan names do not. Wizard bar and floating nav use ink and lime.
6. `/pacing`. Title "Pacing." Overview, orphans, and relabels are section titles with a full stop. A line table still sorts and exports CSV.
7. `/finance` and forecast variance. Section titles have a full stop. Alter billing and unsaved-changes dialogs have no coloured stripe. Forecasting chart uses the theme.
8. `/publishers` and a publisher detail page. PublisherMark only. No hero accent wash. Publisher chart uses the theme.
9. `/creative`, `/scopes-of-work` (including create), `/tasks`, `/insights`. Page titles have a full stop.
10. `/account`, `/profile`, `/support`, one `/admin` page. Same title rule.
11. `/knowledge` and a guide (guide title has no extra full stop), `/tools/behavioural-planner`.
12. `/privacy`, `/data-deletion`, a 403, a 404.
13. `/design-system`. Entity marks (logo, lime, forest, sky, invalid, sm/md/lg, PublisherMark). Brand assets. Charts in light and dark.
14. Sidebar active item is the lime pill in light and dark. Hover tint stays. Mobile width: ink bottom nav, no shadow. There is no collapsed icon rail (offcanvas).
15. `tmp/overnight-exports/`: billing schedule PDF and three HTML emails. Then generate one real MBA PDF and one media plan Excel. PDF is Plus Jakarta Sans with the full-colour logo. Excel title and gantt use the family colour with readable text. Email header is an ink band.
16. One chart PNG export. The plate follows light/dark. Series that are CSS variables may still export in the light colours (C-46 still open).
17. App starts with no missing-module error. Sidebar logo is `/brand/logo-inverted-white.png`.

# Overnight run 2026-10-08

Baseline HEAD `eaee04fb`. Packs: DS-6, DS-7, DS-8, DS-E, DS-10, DS-9.

## Baseline (A2) — 2026-10-07 21:11

- `git rev-parse --short HEAD` → `eaee04fb` (matches expected).
- `git status --short` (before this folder): untracked only
  - `CODEX_FOUNDATION_DISCOVERY.md`
  - `CODEX_REPAIR_DISCOVERY.md`
  - `docs/superpowers/DISCOVERY-brand-05b-ui.md`
  - `docs/superpowers/DISCOVERY-design-system-consolidation.md`
  - `docs/superpowers/discovery-delivered-tile-2026-10-05.md`
  - `docs/superpowers/discovery-fx1-main-live-xano-2026-10-06.md`
- `npm run typecheck` exit 0.
- `npm run lint` exit 0. Pre-existing warnings only (react-hooks/exhaustive-deps on admin, mediaplan create/edit, media containers, finance costs, tasks; unused eslint-disable on channelMediaTypeColour, expertGrid benches, snowflake/pool, learning/evaluator; img warning in AppSidebar.relabels test; SpendingInsightsSection monthlyView).
- `npm run test:brand` exit 0, 68 pass.
- `npm run test:status` exit 0, 4 pass.
- `npm run test:media-families` exit 0, 5 pass.
- `npm run test:charts-registry` exit 0 (5 node + vitest wrapGanttLabel 2).
- `npm run test:client-dashboard` exit 0, 5 pass.
- `npm run test:all` exit 1, ~572s, 118/122 suites passed. Pre-existing failures (do not treat as new):
  - `test:client-server-only` — `scripts/check-client-server-only.mjs` reaches `lib/data/referenceTables.ts` from `app/mediaplans/create/page.tsx`.
  - `test:campaign-dashboard-range` — `SpendChartsRow` snapshot (`components/dashboard/campaign/__tests__/SpendChartsRow.test.tsx`). Expected old button classes and chart colours `#4f8fcb` / `#4ac7eb`; received `rounded-full` button and `#B5D337` / `#49C7EB`.
  - `test:social-delivery` — `channelMediaTypeColour` "keeps distinct media-type identities distinct": expected 9 hexes, got 5 (family colours collide: search/progDisplay/digitalDisplay `#B5D337`, progVideo/digitalVideo/bvod `#246646`).
  - `test:finance-sections` — `routeManifest.test.ts` "every app/**/page.tsx is covered": uncovered `/design-system`, `/data-deletion`, `/privacy`. Admin muted assertion at `:151` passed (230 pass / 1 fail in that file).

## DS-6  DONE e9215699

- Started 2026-10-07 21:12 / finished 2026-10-07 21:17.
- Files changed (33):
  - `components/brand/EntityMark.tsx` (new)
  - `lib/brand/index.ts` (`readableTextOn`)
  - `lib/brand/__tests__/readableTextOn.test.ts` (new)
  - `package.json` (`test:brand` includes the new test)
  - `components/dashboard/HeroBanner.tsx`
  - `components/dashboard/campaign/CampaignHeroBanner.tsx`
  - `components/dashboard/campaign/CampaignSummaryRow.tsx`
  - `components/dashboard/delivery/common/DeliveryDailyChart.tsx`
  - `components/dashboard/delivery/common/DeliveryPacingChart.tsx`
  - `components/dashboard/delivery/shared/LineItemDailyDeliveryChart.tsx`
  - `components/dashboard/campaign/SpendChartsRow.tsx`
  - `components/dashboard/SpendingInsightsSection.tsx`
  - `components/dashboard/CampaignCardCompact.tsx`
  - `components/dashboard/ClientDashboardPageContent.tsx`
  - `components/dashboard/modals/ClientBrainSlideOver.tsx`
  - `components/dashboard/modals/ClientDetailsSlideOver.tsx`
  - `components/dashboard/modals/ClientFinanceSlideOver.tsx`
  - `components/dashboard/modals/ClientKpiSlideOver.tsx`
  - `app/publishers/PublishersPageClient.tsx`
  - `app/publishers/[publisherId]/PublisherDetailClient.tsx`
  - `app/publishers/[publisherId]/PublisherDetailCharts.tsx`
  - `app/publishers/[publisherId]/PublisherDetailsSlideOver.tsx`
  - `app/publishers/[publisherId]/PublisherKpiSlideOver.tsx`
  - `components/AddClientForm.tsx`
  - `components/EditClientForm.tsx`
  - `components/AddPublisherForm.tsx`
  - `components/dashboard/PageHeroShell.tsx` (`brandColour` @deprecated; already ignored)
  - `components/mediaplans/MediaPlanEditorHero.tsx` (`brandColour` @deprecated; no mark)
  - `app/(internal)/design-system/page.tsx`
  - `docs/brain/INVARIANTS.md`
  - `docs/brain/KNOWN-ISSUES.md` (UI-4, UI-6 FIXED)
  - `docs/brain/BLAST-RADIUS.md`
  - `docs/brain/MAP.md`
- Checks and exit codes:
  - typecheck 0
  - lint 0 (same warning set as baseline)
  - test:brand 0 (72 pass, includes 4 readableTextOn)
  - test:status 0 (4)
  - test:media-families 0 (5)
  - test:charts-registry 0
  - test:client-dashboard 0 (5)
  - test:delivery-ui 0 (1 pass, 2 skipped)
  - test:search-delivery-tiles 0 (1 pass, 3 skipped)
  - test:programmatic-delivery 0 (71)
  - test:campaign-row-actions 0 (28)
  - test:campaign-dashboard-range exit 1 — same SpendChartsRow snapshot as baseline (node portion 72 pass). No new assertion.
  - test:social-delivery exit 1 — same distinct-hex failure (5 !== 9). Delivery daily metric-line tests passed.
- Decisions:
  - Adapters and `CampaignDeliverySection` still pass `brandColour`; paint stops in the chart components. File count 33, under the 40-file stop. Confidence 95%.
  - Elapsed bar (D16): track `bg-am-context` in both modes; fill `bg-am-forest` and `dark:bg-am-forest-light`. Today marker `shadow-md` removed. Confidence 85% (dark track stays context, not context-black).
  - `CampaignCardCompact` gained optional `clientName` (card only had `clientSlug`). Caller passes `clientData.clientName`. Confidence 85%.
  - Hero mark size is `lg` (40px). Existing avatar was 48px; pack sizes stop at lg. Confidence 90%.
  - `DeliveryDailyChart`: `mediaTypeColour` kept; fallback that was `brandColour` is `BRAND.colour.forest`. Other multi-line series use `BRAND_SERIES`. Dual-axis metric line stays `DELIVERY_DAILY_METRIC_LINE_COLOR` (test requires theme ink). Confidence 85%.
  - `DeliveryPacingChart`: actual `BRAND.colour.forest`, expected/target `BRAND.colour.context`. Confidence 85%.
  - Publisher client donut uses `BRAND_SERIES` in order. Media stacked series stay `channelColorFor`. Confidence 90%.
  - `MediaPlanEditorHero` title is a ReactNode plan name, not an entity name. Mark skipped. Confidence 90%.
  - Design-system logo example uses `/assembled-logo.png` because DS-7 has not copied `/brand/` yet. Confidence 95%.
  - `getChartPalette` has no runtime caller (only `lib/client-dashboard/__tests__/theme.test.ts:55`). `ClientBrandProvider` stays mounted at `app/layout.tsx:42`. `publisherColourStripeBackground` left in `lib/publisher/publisherColour.ts`.
- Under 90%: elapsed-bar dark track (85%), `clientName` prop (85%), delivery chart fallback colours (85%).
- Left for later:
  - `lib/publisher/publisherColour.ts` `publisherColourStripeBackground` — DS-9 if unused.
  - `lib/client-dashboard/theme.ts` `getChartPalette` and `ClientBrandProvider` — DS-9.
  - Campaign hero black band — DS-8 (`CampaignHeroBanner` still a card shell; ClientMark is in).
  - `PublisherDetailClient` still has a pacing-on-track dot beside `publisherid` — UI-3 / DS-8.
- Morning smoke: client dashboard, a campaign page (hero, summary row, delivery charts), campaign cards on `/dashboard`, the four client slide-overs, `/publishers` and a publisher detail page, `/design-system` Entity marks (logo, lime/forest/sky/invalid at sm/md/lg, PublisherMark).

## DS-7  DONE cba5538f

- Started 2026-10-07 21:18 / finished 2026-10-07 21:25.
- Files changed (27): `app/page.tsx`, `app/icon.svg`, `app/apple-icon.png`, `app/globals.css` (`--sidebar-active-fg` ink `137 32% 9%` in `:root` and `.dark`), `components/ui/sidebar.tsx`, `components/AppSidebar.tsx`, `components/UserMenu.tsx`, `components/ClientLayout.tsx`, `components/brand/BrandLoading.tsx`, `components/AuthLoadingState.tsx`, `app/mediaplans/mba/[mba_number]/edit/loading.tsx`, `app/error.tsx`, `app/not-found.tsx`, `app/client/error.tsx`, `app/global-error.tsx`, `app/(internal)/design-system/page.tsx`, `public/brand/` logos, dot mark, `icon-512.png`, three sign-in arches, `docs/brain/MAP.md`, `KNOWN-ISSUES.md` (UI-8), `BLAST-RADIUS.md`.
- Checks: typecheck 0 (after one fix: `EMAIL_FONT_STACK` is already a string). lint 0, same warnings as baseline. test:brand 0 (72). test:status 0 (4). test:session-expiry 0. test:mba-number-alloc 0 (client menu included). test:finance-sections exit 1 — same baseline `routeManifest` uncovered `/design-system`, `/data-deletion`, `/privacy` (230 pass / 1 fail). Admin muted assertion passed.
- Decisions:
  - No site manifest. Did not create one. Confidence 95%.
  - No icon rail. Sidebar collapse is `offcanvas` (`sidebar.tsx:184`), which hides the sidebar. Dot mark is in the header for `collapsible=icon` only. Confidence 95%.
  - User card uses existing `bg-am-panel` (`tokens.json` `colour.panel` `#1A2620`). No new `--sidebar-panel`. Role badge on the trigger replaced by the email. Confidence 85%.
  - Left sign-in headline is a `p`. The only `h1` is "Sign in to AssembledView." Confidence 95%.
  - Reset password uses `Button` `variant="secondary"` (`border-2 border-secondary`, forest). `outline` is `border-input`, not a forest outline. Confidence 90%.
  - `LoadingDots` already uses `bg-primary`. API unchanged. Confidence 95%.
  - Skeleton `loading.tsx` kept: `app/dashboard/[slug]`, `app/client/[slug]`, `app/pacing`. Spinner loader replaced: media-plan edit. Confidence 95%.
  - `global-error.tsx` renders outside the app CSS. Button uses `BRAND.colour.lime` / `ink` inline. Body uses `EMAIL_FONT_STACK` and sand. Shadow removed. Confidence 90%.
  - Group labels: `SidebarGroupLabel` is now 10px semibold uppercase tracking-wide sidebar-muted. Admin group still passes `tone === "muted"` (`routeManifest.test.ts:151`). Confidence 95%.
  - Top bar: `bg-background` in light, `dark:bg-am-panel`, existing 1px `border-b`, no shadow on the header. Greeting is `text-muted-foreground`. Layout and breakpoints unchanged. Confidence 90%.
  - Favicon preview on `/design-system` uses `/brand/icon-512.png` (app/icon.svg is the metadata file, not a public URL). Confidence 85%.
- Under 90%: footer email instead of the role badge (85%), favicon preview path (85%).
- Left for later: Auth0 hosted login branding (UI-8, dashboard, not code). Old `public/amlogo.png` and carousel photos stay until DS-9 if unreferenced.
- Morning smoke: sign out and view `/`, sign in, sidebar active and hover in light and dark, collapsed rail (offcanvas hides the sidebar; there is no icon rail), mobile width bottom nav, favicon in the tab, a 404, the loading state on a hard refresh.

## DS-8a  DONE f528a067

- Started 2026-10-07 21:26 / finished 2026-10-07 21:29.
- Files: `components/dashboard/PageHeroShell.tsx` (`punctuate` default true via `withFullStop`, `surface` card|ink), `components/mediaplans/MediaPlanEditorHero.tsx` (forwards `punctuate`), `PlanWizardHeader.tsx` (`punctuate={false}`), `TraffickingBuilder.tsx` (`punctuate={!campaignName}`), `PublisherDetailClient.tsx` (`punctuate={false}`), `CampaignHeroBanner.tsx` (ink band, white title, muted-on-black meta, ClientMark, no border, no shadow), `DashboardEntityCards.tsx` (primary gradient stripes and `shadow-e1` removed), `CreativeAssetManager.tsx`, `app/scopes-of-work/[id]/page.tsx`, `docs/brain/INVARIANTS.md`.
- Checks: typecheck 0. lint 0, same warnings. test:brand 0 (72). test:status 0 (4). test:finance-sections exit 1, same uncovered pages (230/1). test:pacing-portfolio 0. test:pacing-channel 0. test:pacing-detail 0. test:campaign-dashboard-range exit 1, same SpendChartsRow snapshot. test:kpi-review 0. test:campaign-row-actions 0 (28). test:plan-drafts 0. `tests/lib/mediaPlanEditorHeroTokens.test.ts` 0 (2).
- Decisions:
  - Campaign cover is its own ink `section`, not `PageHeroShell` (that shell stays a white card; the token test requires `bg-card`). Confidence 95%.
  - Page titles through `MediaPlanEditorHero` gain a full stop by default. Entity names pass `punctuate={false}`: campaign, plan wizard title, publisher, trafficking campaign name, creative campaign name, scope project name. "Welcome back, {client}" stays punctuated. Confidence 90%.
  - Entity card stripes removed and `shadow-e1` dropped on those two cards. Confidence 95%.
- Under 90%: none.
- Left for later: forest top bars on a "Live campaigns" panel were not found under that name. Status debt, tables, and flat utilities are DS-8d. Remaining raw h1 routes are DS-8c.
- Morning smoke: `/dashboard` title "Assembled Media Overview." Client dashboard greeting keeps a full stop. Campaign page is a black hero band, campaign name has no full stop, status pill unchanged. Client dashboard entity cards have no coloured top stripe.

## DS-8b  DONE ddf90cb1

- Started 2026-10-07 21:29 / finished 2026-10-07 21:32.
- Files: `components/pacing/PacingShell.tsx` (`PageHeader` "Pacing."), `OverviewClient.tsx`, `OrphansClient.tsx`, `RelabelsClient.tsx` (inner titles are `Section` h2), `FinanceForecastVariancePageClient.tsx` (`PageShell` + `PageHeader`), `ParseReviewScreen.tsx` (`PageHeader` "Parse review."; publisher and campaign sit in the lede), `IngestReviewScreen.tsx` (`PageShell` standard, section titles via `Section`), `AlterBillingDialog.tsx`, `UnsavedChangesDialog.tsx`, `saving-modal.tsx` (gradient stripes removed).
- Finance section shells already used `PageHeader` (`FinanceSectionsShell.tsx:50`). Plan create/edit titles already go through `PlanWizardHeader` with `punctuate={false}` from DS-8a. No second page title added.
- Checks: typecheck 0. lint 0, same warnings. test:brand 0 (72). test:status 0 (4). test:campaign-row-actions 0 (28). test:kpi-review 0. test:pacing-portfolio 0. test:pacing-channel 0. test:pacing-detail 0. test:plan-drafts 0 (includes UnsavedChangesDialog). test:finance-sections exit 1, same uncovered `/design-system`, `/data-deletion`, `/privacy` (230 pass / 1 fail). test:campaign-dashboard-range exit 1, same SpendChartsRow snapshot.
- Decisions:
  - Overview, orphans, and relabels stay inside `PacingShell` (already the page shell). Their old h1s became `Section` h2s so the page has one h1, "Pacing." Confidence 90%.
  - Ingest review width moved from `max-w-[1200px]` to `PageShell` standard (`max-w-[1600px]`). Confidence 80%.
  - Parse review title is "Parse review." Entity names are in the lede, unpunctuated. Confidence 90%.
  - Caps tile labels, table headers, form labels, and the scenario-planner kicker were left. "What gets written" stays a preview label. Confidence 85%.
- Under 90%: ingest width (80%), leftover caps labels (85%).
- Left for later: PublisherDetailCharts stripe (DS-8c). Status classes, data tables, and flat utilities (DS-8d). Plan wizard rail labels stay uppercase (nav).
- Morning smoke: `/pacing` title "Pacing." Overview, orphans, and relabels are section titles with a full stop under that. `/finance` section titles already have a full stop. Forecast snapshot variance page. Ingest review section titles in sentence case. Alter billing and unsaved-changes dialogs have no coloured top stripe.

## DS-8c  DONE a5cda8b6

- Started 2026-10-07 21:32 / finished 2026-10-07 21:37.
- Files (32): support, privacy, data-deletion, profile (`PageShell`), account (`PageHeader` inside the existing `max-w-6xl` main), `AccessDenied` (403 / forbidden / unauthorized), publishers add dialog and `PublisherDetailCharts` stripes, tasks disabled states, insights, scopes create/edit, eight admin titles, knowledge pages (guide and platform names `punctuate={false}`), behavioural planner, `CONVENTIONS.md`, `KNOWN-ISSUES.md` (UI-5).
- Raw `h1` left on purpose: `app/page.tsx` (sign-in) and `app/global-error.tsx` (outside the app CSS).
- Checks: typecheck 0. lint 0, same warnings. test:brand 0 (72). test:status 0 (4). test:campaign-row-actions 0 (28). test:kpi-review 0. test:plan-drafts 0 after one re-run (first run failed `SplitActionButton` focus-return; re-run 12/12; the component was not edited). test:pacing-portfolio 0. test:pacing-channel 0. test:pacing-detail 0. test:finance-sections exit 1, same uncovered `/design-system`, `/data-deletion`, `/privacy`. test:campaign-dashboard-range exit 1, same SpendChartsRow snapshot.
- Decisions:
  - `PageShell` only where the page root was a simple wrapper (support, privacy, data-deletion, profile, Codex-disabled tasks). Account, insights, knowledge, admin, scopes, and the planner kept their containers and only swapped the heading. Confidence 80%.
  - Legal article h2s stayed sentence-case headings, not `Section`. Confidence 85%.
  - AccessDenied icon circle kept. Item 5 named Key metrics tiles. Confidence 85%.
  - Knowledge article and platform names pass `punctuate={false}`. Confidence 95%.
- Under 90%: containers that are not `PageShell` (80%), legal h2s (85%), AccessDenied circle (85%).
- Left for later: status classes, tables, flat utilities (DS-8d).
- Morning smoke: support, privacy, data deletion, profile, account, a 403, publishers, tasks, insights, a scope create page, an admin page, knowledge home and a guide (guide title has no extra full stop), behavioural planner. Page titles have a full stop. Entity names do not.

## DS-8d  DONE 12202faf

- Started 2026-10-07 21:37 / finished 2026-10-07 21:44.
- Files (17): `ForecastingPageClient.tsx`, `DashboardOverview.tsx`, `KPIEditModal.tsx`, plan edit page, `app/mediaplans/page.tsx`, `ParseReviewScreen.tsx`, both `LineItemPacingTable.tsx` files, `app/account/page.tsx`, `CampaignActions.tsx`, `FloatingSectionNav.tsx`, `PlanWizardBottomBar.tsx`, `button.tsx`, `success-modal.tsx`, `computeKpiStatus.ts`, `KNOWN-ISSUES.md` (UI-3), `MAP.md`.
- Checks: typecheck 0. lint 0, same warnings. test:brand 0 (72). test:status 0 (4). test:campaign-row-actions 0 (28). test:kpi-review 0. test:plan-drafts 0. test:pacing-portfolio 0. test:pacing-channel 0 (includes the line-card tests that read `copyForRowKpiStatus`). test:pacing-detail 0. test:finance-sections exit 1, same uncovered pages. test:campaign-dashboard-range exit 1, same SpendChartsRow snapshot.
- Decisions:
  - Band map is `PACING_UI_STATUS`: on-track → `tone-action`, ahead → `tone-insight`, behind → `tone-attention`, critical → `tone-critical`. Class strings swapped in the UI-3 top 10 except `app/globals.css` (token source). Confidence 90%.
  - Key metrics icon circles are `bg-muted` / `text-muted-foreground`. MetricCard accent bars stay (DS-3b). The live-campaigns `h-1` strip and the collapsible panel strips no longer paint. `gradientClassName` stays on the prop type, deprecated. Confidence 90%.
  - "Campaigns & scope data" is a `Section` title (full stop) with the year and layout controls in `actions`. Confidence 90%.
  - Named tables were not moved onto `DataTable`. `CampaignPacingTable` has expand rows and `sticky top-0 z-20 bg-background` headers. The line-item tables keep frozen columns. Changing those classes would move sticky offsets. Confidence 90%.
  - Flat utilities in `app/**` and `components/**`: 10 lines → 0. `bg-brand-dark` → `bg-am-ink`, `bg-highlight` / `bg-lime` → `bg-am-lime`, `text-darkGrey` → `text-am-ink`, `bg-success` → `bg-am-forest`, `bg-error-hover` → `hover:bg-destructive/90`, `bg-warning` → `bg-tone-attention`. Tailwind `brandPalette` entries stay for DS-9. Confidence 90%.
  - `copyForRowKpiStatus` returns "KPI pending". No dedicated assertion of the old capitalised string. Confidence 95%.
  - Account avatar wash was a decorative on-track tint. It now uses the action tone (same forest). Confidence 85%.
- Under 90%: account avatar (85%).
- Left for later: UI-3 remaining 258 hits (was 358) outside the top 10, including `lib/pacing/kpi/kpiCellColor.ts` (`bg-pacing-on-track-bg`, asserted by `percentUnits.roundTrip.test.ts`). Tables listed in the pack. Tailwind flat palette entries. `accent-bar.tsx` (DS-9).
- Morning smoke: `/dashboard` Key metrics icons are muted, "Campaigns & scope data." has a full stop, live campaigns panel has no coloured top bar. A pacing line table still sorts. Channel CSV "KPI pending". Plan wizard bottom bar and the floating section nav use ink and lime tokens.

## DS-E  DONE f631910c

- Started 2026-10-07 21:46 / finished 2026-10-07 22:01.
- Files (36): `lib/pdf/brandPdf.ts`, `lib/pdf/fonts/plusJakartaSans.ts`, `lib/pdf/fonts/src/*` (three TTFs + OFL), `lib/pdf/__tests__/brandPdf.test.ts`, `scripts/brand/build-pdf-fonts.mjs`, `scripts/brand/render-sample-exports.ts`, `lib/docs/__tests__/pdfText.ts`, `lib/generateMBA.ts`, `lib/generateBillingSchedulePDF.ts`, `lib/generateScopeOfWork.ts`, `lib/generateMediaPlan.ts`, `lib/billing/exportBillingScheduleExcel.ts`, `lib/finance/report/exportReportExcel.ts`, logo path in create/edit pages and `lib/docs/renderDraftDocuments.ts` / `buildMediaItemsFromPersisted.ts` plus two tests, five email files (`inviteSender`, `uploadDigestEmail`, `ops/digest/email`, `ops/health/email`, `relabel/notify`), `next.config.mjs`, draft-stamp and MBA PDF tests, `INVARIANTS.md`, `BLAST-RADIUS.md`, `MAP.md`.
- Checks: typecheck 0. lint 0, same warnings. test:brand 0 (72). test:media-plan-excel 0. test:campaign-documents 0. test:mba-header-date 0 (12) after the text-extraction fix. test:mba-scope 0 (8). test:mba-media-breakdown 0 (8). test:mba-live-dates 0 (21). test:write-finance 0. test:finance-sections exit 1, same uncovered `/design-system`, `/data-deletion`, `/privacy`. `brandPdf.test.ts` 1 pass. `draftStamp` + `renderDraftDocuments` 9 pass (shim).
- Decisions:
  - PDF table header bands were not given a sand rect. The generators had no `setFillColor`. A rect after the header text would cover it, and a rect before it would move the following rows. Header text is ink bold. Hairlines are `PDF_COLOURS.line`. The totals rule is ink. Confidence 75%.
  - `getTextWidth` shrink (max 1pt) was not applied. Existing `splitTextToSize` calls were left. Extracted MBA text still contains the header date, campaign dates, and scope line (`pdf-parse`). Confidence 70%.
  - MBA PDF string assertions moved from a latin1 byte scan to `pdfText` (`pdf-parse`). Custom fonts are not WinAnsi, so the old scan could not see drawn text. The strings are in the extracted text. Confidence 90%.
  - Gantt fill is the row's media family colour (`GANTT_MEDIA_KEY`), else forest. Text on that fill is `readableTextOn`. KPI sheet headers use the same. Grey fills (`FFF2F2F2`, `FFE6E6E6`, `FFD4E6F1`, `FFE0E0E0`, `FFF8F8F8`, finance report blues) became sand. Section title stays ink with white text. Column header row is sand with ink text. Confidence 90%.
  - Invite header word in the ink band is "Assembled Media". The sentence "You've been invited to AssembledView" is unchanged. Upload, health, and pacing digest gained an ink band with "Assembled Media" and kept their titles. Status colours use forest / amber / coral. Confidence 85%.
  - `generateBillingSchedulePDF` has no API route. Tracing added only `/api/mba/generate` and `/api/scopes-of-work/generate-pdf` (`./public/brand/**`). Existing tracing keys were left. Confidence 95%.
  - `lib/reports/campaignReport/buildCampaignReportDeck.ts` still says Arial (deck, not an Excel writer). `lib/utils.ts` still has `#008e5e` (not an email). No KNOWN-ISSUES row named `#008e5e`. Confidence 90%.
  - Sample renderer wrote `tmp/overnight-exports/billing-schedule.pdf`, `pacing-digest.html`, `ops-health.html`, `upload-digest.html`. Skipped MBA PDF, scope PDF, media plan xlsx, finance xlsx, invite HTML, and the relabel `<pre>` (not exported as a builder). Confidence 85%.
- Under 90%: sand header bands (75%), Jakarta width (70%), invite header word (85%), skipped samples (85%).
- Left for later: sand header bands if Luke wants them drawn behind the header text without moving rows. `getTextWidth` pass on fixed columns in the three PDF generators. Deck `fontFace: "Arial"` at `buildCampaignReportDeck.ts:223`. `lib/utils.ts` `#008e5e`.
- Morning smoke: open `tmp/overnight-exports/` (billing schedule PDF, three HTML emails). Generate one real MBA PDF and one media plan Excel from the app. PDF body is Plus Jakarta Sans, logo is the full-colour mark, Excel title and gantt use family colour with readable text, email header is an ink band.

## DS-10  DONE 8a16677a

- Started 2026-10-07 22:02 / finished 2026-10-07 22:08.
- Files (22): `lib/chart-theme.ts` (`getChartTheme`, `familyColourFor`, `useChartTheme`), `styles/chart-tokens.css` (series order matches `BRAND_SERIES`; dark series is the family dark map), `parity.test.ts`, system bar/line/composition/flow/domain/chart-shell, `deliveryDailyChartColors.ts`, `MediaPlanVizSection.tsx`, `ChartSamples.tsx` and `chart-samples.ts` (moved from `/chart-gallery`), design-system Charts section, `routeManifest.ts` (gallery route removed), `eslint.config.mjs` (cleaned chart files dropped from the hex baseline), `noBespokeChartColours.test.ts`, `package.json`, brain docs.
- Checks: typecheck 0. lint 0, same warnings. test:brand 0 (79). test:charts-registry 0 (6 + vitest 2). test:media-families 0 (5). test:delivery-ui 0. test:programmatic-delivery 0. test:search-delivery-tiles 0. test:finance-forecast 0. test:campaign-dashboard-range exit 1, same SpendChartsRow snapshot. test:social-delivery exit 1, same distinct-hex assertion (5 vs 9).
- Decisions:
  - Dark series map: video forest → forest light, OOH forest light → forest text on black, audio muted → muted on black, print context black → context, production context → context black, social and search/display unchanged. Confidence 75%.
  - Bespoke delivery, spend, publisher, and media-plan charts were kept. Their data shapes are not system-chart props. Colour literals in `components/charts` were removed. Confidence 90%.
  - PNG canvas plate uses `getChartTheme` (white in light, panel in dark). SVG `var(--av-*)` fills still do not resolve in the standalone export. C-46 stays open. C-151 marked FIXED for the CSS dark series. Confidence 85%.
  - Bar radius uses the theme pill (999) and bar gap 2 on the shared bar and combo charts. Histogram keeps its tight category gap. Confidence 85%.
- Under 90%: dark family map (75%), C-46 still open (85%), pill radius (85%).
- Left for later: wire every bespoke chart through `useChartTheme` instead of `var(--av-chart-N)`. Inline computed colours on the PNG SVG path (C-46).
- Morning smoke: `/design-system` Charts in light and dark. Campaign delivery charts, client dashboard spend charts, a publisher chart, finance forecasting, and one PNG export (the plate should follow the mode; series that are CSS variables may still export light).

## DS-9  DONE 09ae59b7

- Started 2026-10-07 22:09 / finished 2026-10-07 22:12.
- Deleted: `accent-bar.tsx`, `animated-dot-field.tsx`, `wave-ribbon.tsx`, `corner-dot-cluster.tsx`, `brand-mark-watermark.tsx`, `brandMarkColours.ts`, `cardHelpers.ts`, `ClientBrandProvider.tsx`, `lib/client-dashboard/theme.ts`, `palette.ts`, `theme.test.ts`, `styles/globals.css`, `.eslintrc.json`, `public/amlogo.png`, `assembled-logo.png`, `assembled-media-logo.png`, `ferris-wheel.jpg`, `white-building.jpg`, `modern-hallway.jpg`, `orange-lighthouse.jpg`. Edited: `app/layout.tsx` (provider unmounted), `publisherColour.ts` (stripe helper removed), `package.json` (`test:client-dashboard` removed), `eslint.config.mjs` comment, brain docs.
- Checks: typecheck 0. lint 0, same warnings. test:brand 0 (79). test:status 0 (4). test:media-families 0 (5). test:charts-registry 0. test:delivery-ui 0. test:campaign-dashboard-range exit 1, same SpendChartsRow snapshot. test:finance-sections exit 1, same uncovered `/design-system`, `/data-deletion`, `/privacy`.
- Decisions:
  - `ClientBrandProvider` had no `useClientBrand` caller. The mount and the theme module went together. Confidence 95%.
  - `ContainerEntryModeToggle` kept because `scripts/wire-ux5-entry-mode.mjs` and `scripts/fix-ux5-entry-mode.mjs` still name it. Confidence 95%.
  - `searchSeriesPalette.cost` kept because `channelMediaTypeColour.test.ts` asserts it. Confidence 95%.
  - Plus Jakarta Sans and Instrument Serif `next/font` imports stay. They are applied on `html`/`body`. Confidence 95%.
  - Deprecated `brandColour` props, `ChannelCoverageEntry.colour`, `ROLE_STYLES`, Button `success`/`warning`, Badge/ProgressBar `customColor`, and Tailwind `brandPalette` were not swept. Confidence 80% that some are still referenced.
- Under 90%: the unswept candidate list (80%).
- Left for later: the kept candidates above. `docs/client-dashboard/README.md` still describes `ClientBrandTheme`.
- Morning smoke: app starts, sign-in arches still load, sidebar logo is `/brand/logo-inverted-white.png`, a generated PDF still shows `/brand/logo-full-colour.png`.

## J. Final checks — 2026-10-07 22:24

- typecheck exit 0.
- lint exit 0. Same warning set as A2.
- test:all exit 1, 564s, 117/121. Failed suites: `test:client-server-only`, `test:campaign-dashboard-range`, `test:social-delivery`, `test:finance-sections`. Same four as A2. `test:client-dashboard` is gone (DS-9), so the denominator is 121 not 122. No new failure.
- build exit 0 (Next.js 15.5.24, ~146s).

String search of `app/` and `components/` (tsx, ts, css):

- `bg-gradient` / `linear-gradient`: 8 hits, 3 files.
  - `app/globals.css:479` `.status-bar-ahead`
  - `app/globals.css:483` `.status-bar-on-track`
  - `app/globals.css:487` `.status-bar-behind`
  - `app/globals.css:503` `.status-bar-critical`
  - `app/globals.css:511` `.skeleton-shimmer`
  - `components/creative/mockups/social/FeedShells.tsx:188` and `:201`
  - `components/creative/mockups/social/TikTokAd.tsx:62`
  - Extra, not in the pattern: `app/globals.css:492` `.social-ig-ring` is a `conic-gradient`.
- `shadow-` / `box-shadow`: 363 hits, 153 files. Left in place. This run did not restyle untouched surfaces.
  - `app/account/page.tsx`
  - `app/admin/fireflies-unattributed/page.tsx`
  - `app/admin/m365-reconciliation/page.tsx`
  - `app/admin/media-container-best-practice/page.tsx`
  - `app/admin/myhours-mapping/page.tsx`
  - `app/admin/schedule-ingest/page.tsx`
  - `app/admin/users/new/NewAdminUserForm.tsx`
  - `app/admin/users/new/page.tsx`
  - `app/admin/users/page.tsx`
  - `app/client/ClientHubPageClient.tsx`
  - `app/dashboard/[slug]/[mba_number]/components/CampaignActions.tsx`
  - `app/dashboard/[slug]/[mba_number]/components/MediaTable.tsx`
  - `app/finance/forecast/snapshots/variance/FinanceForecastVariancePageClient.tsx`
  - `app/globals.css`
  - `app/insights/InsightsPageClient.tsx`
  - `app/knowledge/[section]/page.tsx`
  - `app/knowledge/calculators/page.tsx`
  - `app/knowledge/guides/[slug]/page.tsx`
  - `app/knowledge/page.tsx`
  - `app/knowledge/platforms/[slug]/page.tsx`
  - `app/knowledge/resources/page.tsx`
  - `app/mediaplans/create/page.tsx`
  - `app/mediaplans/mba/[mba_number]/edit/page.tsx`
  - `app/mediaplans/page.tsx`
  - `app/pacing/(shell)/overview/OverviewClient.tsx`
  - `app/pacing/loading.tsx`
  - `app/profile/page.tsx`
  - `app/publishers/[publisherId]/PublisherDetailCharts.tsx`
  - `app/publishers/[publisherId]/PublisherDetailClient.tsx`
  - `app/publishers/PublishersPageClient.tsx`
  - `app/scopes-of-work/[id]/edit/page.tsx`
  - `app/scopes-of-work/[id]/page.tsx`
  - `app/scopes-of-work/create/page.tsx`
  - `app/scopes-of-work/page.tsx`
  - `app/tasks/TasksPageClient.tsx`
  - `components/ava/AvaPacingNudge.tsx`
  - `components/ava/AvaSkillActionSets.tsx`
  - `components/billing/ManualBillingSpreadsheetCell.tsx`
  - `components/billing/MbaBillingAutoCalcSummary.tsx`
  - `components/billing/MbaBillingModal.tsx`
  - `components/charts/system/chart-shell.tsx`
  - `components/charts/system/domain-charts.tsx`
  - `components/ChatQuestionCard.tsx`
  - `components/ChatWidget.tsx`
  - `components/client-hub/UpcomingBillingSection.tsx`
  - `components/ClientLayout.tsx`
  - `components/creative/ClientCreativePicker.tsx`
  - `components/creative/CreativeAdminLanding.tsx`
  - `components/creative/CreativeAssetManager.tsx`
  - `components/creative/CreativeAssetTable.tsx`
  - `components/creative/CreativeCampaignPicker.tsx`
  - `components/creative/mockups/LivePageMockup.tsx`
  - `components/creative/mockups/MockupDialog.tsx`
  - `components/creative/mockups/scenes/TvSceneMockup.tsx`
  - `components/creative/mockups/social/FeedShells.tsx`
  - `components/creative/mockups/social/InstagramStoryAd.tsx`
  - `components/creative/mockups/WebPageMockTemplates.tsx`
  - `components/creative/searchads/GoogleSerpAd.tsx`
  - `components/creative/searchads/SearchAdWorkshopDialog.tsx`
  - `components/dashboard/campaign/CampaignHoursWidget.tsx`
  - `components/dashboard/campaign/CampaignKpiPacingStrip.tsx`
  - `components/dashboard/campaign/CampaignReadSection.tsx`
  - `components/dashboard/campaign/CampaignStatusStrip.tsx`
  - `components/dashboard/campaign/ChannelsAtAGlance.tsx`
  - `components/dashboard/campaign/KpiReview.tsx`
  - `components/dashboard/campaign/MaterialDeadlinesStrip.tsx`
  - `components/dashboard/campaign/MediaPlanVizSection.tsx`
  - `components/dashboard/campaign/PlannedAudienceSection.tsx`
  - `components/dashboard/campaign/SpendChartsRow.tsx`
  - `components/dashboard/CampaignCardCompact.tsx`
  - `components/dashboard/CampaignExportsSection.tsx`
  - `components/dashboard/ClientKpiSection.tsx`
  - `components/dashboard/ClientProfileLinks.tsx`
  - `components/dashboard/HeroBanner.tsx`
  - `components/dashboard/shared/DateRangeSelector.tsx`
  - `components/dashboard/skeletons.tsx`
  - `components/dashboard/SpendingInsightChartShell.tsx`
  - `components/finance/EditableFinanceGrid.tsx`
  - `components/finance/sections/costs/CostsClientPaysClient.tsx`
  - `components/finance/sections/costs/CostsOverviewClient.tsx`
  - `components/finance/sections/FinanceSectionsOverview.tsx`
  - `components/finance/sections/forecasting/ForecastingPageClient.tsx`
  - `components/finance/sections/forecasting/TargetGrid.tsx`
  - `components/finance/sections/forecasting/VarianceTargetVsActualView.tsx`
  - `components/finance/sections/investment/InvestmentExplorerClient.tsx`
  - `components/finance/sections/invoicing/InvoicingClientCard.tsx`
  - `components/finance/sections/invoicing/InvoicingLocalFilters.tsx`
  - `components/finance/sections/invoicing/InvoicingToolbar.tsx`
  - `components/finance/sections/inXero/InXeroOutcomeSection.tsx`
  - `components/finance/sections/periods/PeriodBoard.tsx`
  - `components/finance/sections/periods/PeriodDetail.tsx`
  - `components/finance/sections/xero/XeroMatchesPanel.tsx`
  - `components/finance/sections/xero/XeroMonthHealthStrip.tsx`
  - `components/ingest/IngestReviewScreen.tsx`
  - `components/ingest/ParseReviewScreen.tsx`
  - `components/insights/QuickAddInsightForm.tsx`
  - `components/insights/RecentInsightsPanel.tsx`
  - `components/kpis/KPIEditModal.tsx`
  - `components/learning/FormulaCalculator.tsx`
  - `components/learning/UtmBuilder.tsx`
  - `components/media-containers/ContainerEntryModeToggle.tsx`
  - `components/media-containers/ExpertGrid.tsx`
  - `components/media-containers/ExpertGridWeekContextMenu.tsx`
  - `components/media-containers/OOHContainer.tsx`
  - `components/mediaplan/PlanDraftChrome.tsx`
  - `components/mediaplans/__tests__/SplitActionButton.test.tsx`
  - `components/mediaplans/BuilderIssuesBadge.tsx`
  - `components/mediaplans/FloatingSectionNav.tsx`
  - `components/mediaplans/MediaPlanLoadStatusPill.tsx`
  - `components/mediaplans/PlannerCreateTargetsStrip.tsx`
  - `components/mediaplans/PlanWizardSaveMessages.tsx`
  - `components/mediaplans/PlanWizardShell.tsx`
  - `components/mediaplans/SplitActionButton.tsx`
  - `components/pacing/channel/ChannelStatusTiles.tsx`
  - `components/pacing/detail/CampaignDetailModal.tsx`
  - `components/pacing/PacingStatusSummary.tsx`
  - `components/pacing/portfolio/PortfolioStatusTiles.tsx`
  - `components/pacing/relabel/RelabelsClient.tsx`
  - `components/pacing/scenario/ScenarioPlannerContext.tsx`
  - `components/pacing/StatusLegend.tsx`
  - `components/planning/AllChannelsCompareTable.tsx`
  - `components/planning/ExportDeckButton.tsx`
  - `components/planning/RecommendedSplitBlock.tsx`
  - `components/planning/SavedAudienceAttachList.tsx`
  - `components/planning/StageAudiences.tsx`
  - `components/planning/StageBrief.tsx`
  - `components/planning/StageCompare.tsx`
  - `components/planning/StageConstraints.tsx`
  - `components/planning/StageDiagnosis.tsx`
  - `components/planning/UploadedAudiencePicker.tsx`
  - `components/PublisherKpiForm.tsx`
  - `components/tasks/TaskBoard.tsx`
  - `components/tasks/TaskBulkBar.tsx`
  - `components/tasks/TaskDetailClient.tsx`
  - `components/tasks/TaskQuickAdd.tsx`
  - `components/tasks/TasksFilterBar.tsx`
  - `components/tasks/TemplateFormDialog.tsx`
  - `components/tasks/TimesheetDraftsPanel.tsx`
  - `components/trafficking/BestPracticeRail.tsx`
  - `components/trafficking/NamingLevelGrid.tsx`
  - `components/trafficking/TraffickingBuilder.tsx`
  - `components/ui/alert-dialog.tsx`
  - `components/ui/chart.tsx`
  - `components/ui/command.tsx`
  - `components/ui/dialog.tsx`
  - `components/ui/dropdown-menu.tsx`
  - `components/ui/popover.tsx`
  - `components/ui/select.tsx`
  - `components/ui/sheet.tsx`
  - `components/ui/sidebar.tsx`
  - `components/ui/switch.tsx`
  - `components/ui/toast.tsx`
  - `components/ui/tooltip.tsx`
- `#008e5e`: 0.
- `Rethink`: 0.
- `Helvetica`: 0 in `app/` and `components/`.
- `amlogo`: 0.
- `assembled-logo`: 0.
