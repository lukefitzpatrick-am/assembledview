# DS-6 discovery (read-only)

Client and publisher colour still paints marks, dots, stripes, chart series and card chrome. `PageHeroShell` already ignores `brandColour` (`components/dashboard/PageHeroShell.tsx:52`). `getChartPalette` has no runtime caller (only `lib/client-dashboard/__tests__/theme.test.ts:55`). `ClientBrandProvider` stays mounted at `app/layout.tsx:42`.

## Will edit (paint or new API)

- `lib/brand/index.ts` — add `readableTextOn` after `hexToRgb` (`:37`).
- `lib/brand/__tests__/readableTextOn.test.ts` — new. `package.json:23` `test:brand` must include it.
- `components/brand/EntityMark.tsx` — new (`ClientMark`, `PublisherMark`).
- `components/dashboard/HeroBanner.tsx:40-46` initials, `:95` spend dot, `:124-150` logo/initials circle. Replace with `ClientMark`. Keep `brandColour` prop, deprecate paint.
- `components/dashboard/campaign/CampaignHeroBanner.tsx:101` budget dot → `ClientMark` beside `campaign.clientName` (`:82`).
- `components/dashboard/campaign/CampaignSummaryRow.tsx:53-73` `timelineElapsedFallbackColor` and `:214-216` bar fill. Forest on context track (`bg-am-forest` / `dark:bg-am-forest-light`, track `bg-am-context`). Deprecate `brandColour`.
- `components/dashboard/delivery/common/DeliveryDailyChart.tsx:54-56` stop using `brandColour` as spend colour. Media type keeps `mediaTypeColour`; otherwise forest. Deprecate prop.
- `components/dashboard/delivery/common/DeliveryPacingChart.tsx:33-34` actual → forest, expected/target → context. Deprecate `brandColour`.
- `components/dashboard/delivery/shared/LineItemDailyDeliveryChart.tsx:23` already unused; add `@deprecated`.
- `components/dashboard/campaign/SpendChartsRow.tsx:39` and `components/dashboard/SpendingInsightsSection.tsx:90` — prop unused for paint; `@deprecated` only.
- `components/dashboard/CampaignCardCompact.tsx:55,160` `--brand-color` (only reader is this file). Show `ClientMark` + client name. Needs optional `clientName` (card has `clientSlug` only, `:44`). Caller `ClientDashboardPageContent.tsx:435-452`.
- Slide-overs, remove gradient stripe and tinted icon chip; mark in the header:
  - `components/dashboard/modals/ClientDetailsSlideOver.tsx:51-70`
  - `components/dashboard/modals/ClientFinanceSlideOver.tsx:126` (same stripe pattern)
  - `components/dashboard/modals/ClientKpiSlideOver.tsx:38`
  - `components/dashboard/modals/ClientBrainSlideOver.tsx:30-40`
  - `app/publishers/[publisherId]/PublisherDetailsSlideOver.tsx:27-66`
  - `app/publishers/[publisherId]/PublisherKpiSlideOver.tsx:25` (same stripe)
- `app/publishers/PublishersPageClient.tsx:54-64` stripe, `:102-123` card border/initials, `:570-594` table dot and rail → `PublisherMark`.
- `app/publishers/[publisherId]/PublisherDetailClient.tsx:20,63-86` `PUBLISHER_HERO_ACCENT` initials circle → `PublisherMark`. Stop passing accent into charts for paint.
- `app/publishers/[publisherId]/PublisherDetailCharts.tsx:62-67,121-123,268` `chartColourOverride` and tinted border. Client donut uses `BRAND_SERIES` (not publisher colour). Media series already `channelColorFor`. Deprecate `brandColour`.
- `components/mediaplans/MediaPlanEditorHero.tsx:73` — shell already ignores colour; no extra mark unless a client name is in the title (confirm at build; skip if the title is the plan name).
- Forms, one preview element:
  - `components/AddClientForm.tsx:798-825`
  - `components/EditClientForm.tsx:881`
  - `components/AddPublisherForm.tsx:218-238` replace the colour square with `PublisherMark`.
- `app/(internal)/design-system/page.tsx` — new Section after Status (`:328`).
- Docs: `docs/brain/INVARIANTS.md` UI section (`:257`), `KNOWN-ISSUES.md` UI-4 (`:314`) and UI-6 (`:316`), `BLAST-RADIUS.md` dashboards (`:100`) and shared core, `MAP.md:212`.

## Leave (pass-through only; prop stays)

Adapters and `CampaignDeliverySection.tsx` pass `brandColour` into chart props. Paint stops in the chart components, so these files stay. Same for `ClientDashboardPageContent.tsx` pass-throughs except the card `clientName`. `lib/publisher/publisherColour.ts` `publisherColourStripeBackground` stays (DS-9). `lib/client-dashboard/theme.ts` `getChartPalette` stays. Forms keep saving `brand_colour` / `publisher_colour`.

## Not touched

`lib/api/**`, `db/**`, `app/api/**`, pacing maths, money. `components/ui/accent-bar.tsx` is UI-5 (DS-8), not this pack.

## File count

About 28 files to edit plus 2 new source files. Under the 40-file cap. Adapters are not in the edit set.
