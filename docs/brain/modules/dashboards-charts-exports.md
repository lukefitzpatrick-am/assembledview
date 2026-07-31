# Module: Dashboards, Charts & Document Generation

## Client dashboards

- Home `/dashboard` (`DashboardOverview`): Key metrics tiles derive from the same filtered live campaign/scope arrays as the panels (`lib/dashboard/homeDashboardFilters.ts`). Filters update tiles and panel badges together; "Clear filters" clears the active filter only and does not wipe saved client pins. Heading outline: `PanelRow` section titles are `h2`; nested `PanelTitle` panels under Campaigns & scope use `as="h3"` (default `PanelTitle` is `h2`, `CardTitle` is `h3`).
- Routes: `app/dashboard/[slug]/**` (tenant-scoped client views) + `components/dashboard/**` (57 files: hero KPI bar, spending insights, campaign viz, delivery sections, slide-overs).
- Campaign MBA page: **planned media-by-type donut** is authoritative from the **delivery schedule** (`SpendChartsRow`). Media plan Summary must not show a second media-mix donut — it shows line-item gross bars labeled as such. Progress summary pacing sentence uses `computePacing` → `pacingStatus()` (`lib/dashboard/campaignPacingVerdict.ts`). Client details modal never links clients to `/mediaplans/.../edit`. Live-now freshness is derived from delivered `asOf`, never a hardcoded "ago".
- Client hub campaign grid (`ClientDashboardPageContent`) uses `ViewState` / `ViewStateBoundary` for status-pill filtering (zero in bucket → Clear filters; zero campaigns overall → create CTA). Campaigns are SSR — no list-fetch error branch.
- Money/date presentation: client-facing dashboard surfaces use `lib/format/money.ts` (`formatMoney` / `formatMoneyCompact` / `formatPercent`) and `lib/format/date.ts`. KPI tiles + chart axes → compact; tables/line items/invoice-reconcile figures → `formatMoney` with 2 decimals. Do not mix compact and full within one card/KPI row.
- API: `GET /api/dashboard/[slug]` (and `/delivered`) — client users must match slug via `getUserClientSlugs`; admin is unscoped (SEC-4 FIXED).
- Aggregation layer: `lib/api/dashboard/{client,publisher,global,finance,shared}.ts` — `shared.ts` owns `pickHighestVersionRow` / `isBookedApprovedCompleted` / `normalizeSchedule`, i.e. **which plan version every dashboard number comes from**, plus the shared 10s axios timeout.
- `lib/dashboard/plannedSpendConsistency.ts` deliberately couples the "Planned to date" and "Plan committed" (`budgetUtilizedPct`) tiles to one computation; its status filter must stay in sync with `deliveryScheduleByMBA` in `lib/api/dashboard/client.ts`. The UI label is "Plan committed" (planned ÷ plan budget) — not delivered utilisation.
- Campaign summary "Remaining" is `budget − delivered` (`lib/dashboard/budgetSpendTiles.ts`) so Delivered + Remaining = Budget. Client campaign cards bind progress to **expected spend to date** (same basis as the campaign-page Expected Spend tile), not Snowflake delivered.
- "Delivered" money comes from `lib/delivery/deliveredTotals` (same figure as /pacing/direct — but fetched cache-bypassed, P-7).
- Brand theming: `lib/client-dashboard/` (small, 2 importers — the real dashboard logic is in `components/dashboard` + `lib/dashboard` + `lib/api/dashboard`). `useClientBrand()` falls back silently to AV defaults (plausible wrong colours, not an error). Client brand hex columns still missing in Xano (known TODO).

## Chart system

- `lib/chart-theme.ts` — palettes (`CHART_PALETTE`, colour-blind, sequential/diverging/status) — "no chart hard-codes a hex".
- `lib/charts/registry.ts` — `MEDIA_TYPE_REGISTRY`, THE media-type chart colour/label source, mirroring `mediaTypeTheme` in `lib/utils` (two overlapping colour sources — keep in sync).
- `lib/charts/theme.ts` — Recharts plumbing: Tailwind arbitrary selectors keyed on Recharts' literal default strokes (`#ccc`/`#fff`) — **a Recharts upgrade that changes those defaults silently un-styles every chart**.
- `components/charts/system/*` — the chart component library; PNG export via html2canvas (client-only, breaks on cross-origin images).
- Normative UI rules: `docs/design-refresh/SYSTEM_RULES.md` (see INVARIANTS UI section).

## Document / export generation

Three stacks — know which one you're in:
1. **exceljs** workbooks: `lib/generateMediaPlan.ts` (2.3k lines — also the `LineItem`/`MediaItems` **type hub with 32 importers**; renaming a field cascades to all 20 containers + KPI grouping + Excel), finance exports (7 modules), naming/trafficking workbooks, MI spec workbook. Editor Excel stays client-side; `POST /api/mediaplans/generate-pdf` is locked (admin/manager, `{mba_number,version_number}` only) and returns stored file metadata — no client totals.
2. **jsPDF**: `generateMBA.ts` (PC3: footer `v{n} · {hash8}` from `snapshot_checksum`; `/api/mba/generate` renders only from `schedule_months` + `approved_slice` + `mba_fee_snapshots`, `requireRole(admin|manager)`, 422 unless approved-or-beyond), `generateScopeOfWork.ts`, `generateBillingSchedulePDF.ts`.
3. **PPTX ×2 incompatible approaches**: pptx-automizer (`lib/planning/export/buildPlannerDeck.ts` — never starts from blank; hardcoded placeholder geometry) vs raw JSZip token substitution (`lib/reports/buildPerformanceReport.ts` — fixed-arity payload; adding a 5th channel/KPI means changing template + token map + tuple types + AVA tool together; `escapeXmlText` must escape `&` first).

Checksum: `lib/docs/snapshotChecksum.ts` — sha256 over canonical `(schedule_months + approved_slice + fee snapshot)`; written on publish to `media_plan_versions.snapshot_checksum`; weekly tripwire `GET /api/cron/snapshot-checksum` (CRON_SECRET, report-only).

While an unpublished draft exists, document downloads keep serving the **published tip** (edit page `isPublished` gate + toast “Publish this plan to download and send to client”).

Template/skill files resolve via `process.cwd()` — serverless bundle tracing must include them.

## Email

- `lib/email/sendHtmlEmail.ts` (`server-only`, SendGrid; **throws** when `SENDGRID_API_KEY` missing — cron digests fail loudly; `EMAIL_FROM` required).
- `lib/email/inviteSender.ts` (Auth0 invites, SMTP fallback). Consumers: admin users route + the 3 digest crons.

## Excel/export gotchas (verified, recurring)

- Excel Column N "Gross Media" contains **net** (C-1); no per-line fee column; export reads `calculateAssembledFee()` totals verbatim, never recomputes per line.
- `groupLineItems` substitutes `deliverablesAmount` when `grossMedia === 0` — inflates section totals for client-pays lines.
- Partial-MBA: export must read `partialMBAValues` (see INVARIANTS fee section).
- exceljs is imported client-side in the mega-pages and finance dialogs (bundle cost); `file-saver` static in several finance components.
