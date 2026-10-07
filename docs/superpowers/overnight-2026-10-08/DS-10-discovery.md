# DS-10 discovery

Recharts imports: `components/charts/system/{bar,composition,relation,line,flow}-charts.tsx`, `components/ui/chart.tsx`.

Custom SVG: `components/charts/system/domain-charts.tsx`, `custom-charts.tsx`, `chart-shell.tsx` (PNG).

Delivery: `components/dashboard/delivery/common/DeliveryDailyChart.tsx`, `DeliveryPacingChart.tsx`, `LineItemDailyDeliveryChart.tsx`, `deliveryDailyChartColors.ts`. Colour source after DS-6 is `getMediaColor` / `BRAND` / `BRAND_SERIES`. Metric line stays `var(--av-ink)`.

Other: `SpendChartsRow.tsx`, `MediaPlanVizSection.tsx`, `PublisherDetailCharts.tsx`. Kept bespoke (data shape is not a system-chart prop). Colours already from brand or registry. PNG plate in `captureNodePng` now uses `getChartTheme`.

Straight swap: none. System components already are the chart system. Gallery page moved into `/design-system` Charts.

`lib/charts/theme.ts` attribute-selector `#ccc` / `#fff` left (pack).
