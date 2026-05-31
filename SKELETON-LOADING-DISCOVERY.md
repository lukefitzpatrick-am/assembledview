# Skeleton Loading Discovery

Read-only investigation of current loading-state behaviour ahead of a possible skeleton-loading implementation.

---

## Prerequisite checks

| Check | Result |
|-------|--------|
| `git branch --show-current` | `localhost` ✓ |
| `git status` | On branch `localhost`. Untracked: `docs/kpi/`. No staged or modified tracked files at time of discovery. |

---

## 1. MBA edit page (campaign loading)

### Route / file paths (confirmed by glob)

| Path | Role |
|------|------|
| `app/mediaplans/mba/[mba_number]/edit/page.tsx` | Main page component |
| `app/mediaplans/mba/[mba_number]/edit/loading.tsx` | Next.js route-level loading UI |

### Server vs client component

- **`page.tsx`**: Client component (`"use client"` at line 1).
- **`loading.tsx`**: Server component (no `"use client"`).

### Data fetching — trigger and location

| Phase | Mechanism | File + lines |
|-------|-----------|----------------|
| Campaign metadata | `useEffect` → `fetch()` to `/api/mediaplans/mba/${mbaNumber}?…&skipLineItems=true` | `app/mediaplans/mba/[mba_number]/edit/page.tsx` 2516–3006 |
| Clients list | `useEffect` → `fetch("/api/clients")` | same file 3009–3024 |
| Line items (per enabled media type) | `useEffect` when `loadPhase === "loadingLineItems"` → parallel calls via `get*LineItemsByMBA` / `loadSingleMediaTypeLineItems` | same file 3194–3328+ |
| Single client fees | `fetch(\`/api/clients/${id}\`)` inside helper | same file ~1486 |
| Publishers | `useEffect` → `fetch("/api/publishers")` | same file ~1898–1914 |

No SWR, React Query, or server-component fetch on this route. State is local React `useState` + `react-hook-form`, with `useMediaPlanContext` for MBA number.

### Loading UI during fetch

**A. Next.js route transition (`loading.tsx`)** — full-screen centred spinner + text:

```tsx
<Loader2 className="h-10 w-10 animate-spin text-primary" />
<h2>Loading campaign</h2>
<p>Preparing your media plan editor…</p>
```

File: `app/mediaplans/mba/[mba_number]/edit/loading.tsx` lines 4–14.

**B. Client bootstrapping (`loadPhase === "bootstrapping"`)** — partial page shell with spinners in hero and campaign-details card:

```tsx
<Loader2 className="h-4 w-4 animate-spin" />
<span>Loading campaign details…</span>
// …
<span>Loading…</span>
```

File: `app/mediaplans/mba/[mba_number]/edit/page.tsx` lines 8025–8066.

**C. Line-item phase (`loadPhase === "loadingLineItems"`)** — main form renders; per-media spinners + floating status pill:

- Per-section: `MediaContainerSuspenseFallback` (CSS spinner ring + `"Loading {label}…"`) — lines 1198–1207, shown at 8669–8670.
- Lazy containers: `<Suspense fallback={<MediaContainerSuspenseFallback …>}>` — line 8694.
- Floating pill: `MediaPlanLoadStatusPill` with `LoadingDots`, driven by `loadPhase === "loadingLineItems"` — lines 9105–9107.

**D. Error state** — centred error message + “Return to Media Plans” button — lines 8069–8080.

### `loading.tsx` / `<Suspense>`

| Boundary | Present? | Notes |
|----------|----------|-------|
| `loading.tsx` | Yes | `app/mediaplans/mba/[mba_number]/edit/loading.tsx` |
| `<Suspense>` | Yes | Wraps each lazy-loaded media container (line 8694) |

### Rendered content shape (when loaded)

- Hero banner (`MediaPlanEditorHero`)
- Two-column layout: **Campaign Details** form (comboboxes, date pickers, switches for ~20 media types) + **Quick Actions** sidebar
- KPI section
- **Media Containers**: stacked accordion/card sections per enabled media type (tables/grids inside each container)
- Billing schedule tables, exports, floating section nav
- Sticky save/action bar

### Loading state variables

| Variable | Type / values | Used for UI? |
|----------|---------------|--------------|
| `loadPhase` | `"bootstrapping" \| "loadingLineItems" \| "ready" \| "error"` | Yes — primary phase gate (8025, 8660, 9107) |
| `isLoading` | `boolean` | Yes — save/generate buttons, KPI host, navigation guard |
| `loading` | `boolean` | Set in fetch effect (1768, 2530, 2984) but **not read in JSX** (dead for render) |
| `mediaLoadStatus` | per-media `"idle" \| "loading" \| "ready" \| "error"` | Yes — section loaders (8658–8686) |
| `lineItemLoadItems` | `{ name, status, error? }[]` | Yes — `MediaPlanLoadStatusPill` |
| `isKPILoading` | `boolean` | Yes — KPI section (8640) |

**Note:** `MediaPlanLoadModal` is imported (line 70) but **not rendered** anywhere in this file.

---

## 2. Finance pages (`/finance` section)

### Route / file paths (confirmed by glob)

| Route | Files |
|-------|-------|
| `/finance` | `app/finance/page.tsx`, `app/finance/FinanceHubPageClient.tsx`, `app/finance/layout.tsx` |
| `/finance/receivables` | `app/finance/receivables/page.tsx`, `app/finance/receivables/ReceivablesPageClient.tsx` |
| `/finance/forecast/snapshots/variance` | `app/finance/forecast/snapshots/variance/page.tsx`, `…/FinanceForecastVariancePageClient.tsx` |

No `app/finance/**/loading.tsx` found.

### Server vs client component

| File | Type |
|------|------|
| `app/finance/page.tsx` | Server — wraps client in `<Suspense>` |
| `app/finance/FinanceHubPageClient.tsx` | Client (`"use client"`) |
| `app/finance/layout.tsx` | Server — `AdminGuard` wrapper |
| `app/finance/receivables/page.tsx` | Server — `<Suspense fallback={null}>` |
| `app/finance/receivables/ReceivablesPageClient.tsx` | Client |
| `app/finance/forecast/snapshots/variance/page.tsx` | Server |
| `app/finance/forecast/snapshots/variance/FinanceForecastVariancePageClient.tsx` | Client |

### Data fetching — trigger and location

| Area | Mechanism | File + lines |
|------|-----------|----------------|
| Hub billing + payables | Zustand `useFinanceStore` — `scheduleFinanceFetchAll()` debounced from `useEffect` → `fetchAll()` → `fetchBilling` / `fetchPayables` | `FinanceHubPageClient.tsx` 712–758; `lib/finance/useFinanceStore.ts` 63–109, 204–229 |
| Hub receivables tab | `useReceivablesData(activeTab)` — explicit fetch on `fetchKey` bump (Load/Refresh), `fetchFinanceBillingForMonths` | `lib/finance/useReceivablesData.ts` 142–234 |
| Receivables page | Same `useReceivablesData("billing")` | `ReceivablesPageClient.tsx` 125–135 |
| Forecast variance | `useEffect` → `fetch("/api/finance/forecast/snapshots")`; compare via `fetch("/api/finance/forecast/snapshots/variance")` | `FinanceForecastVariancePageClient.tsx` ~177, ~219 |
| Dynamic hub panels | `next/dynamic` import of overview/payables/accrual/forecast panels | `FinanceHubPageClient.tsx` 96–111 |

No SWR/React Query on finance routes.

### Loading UI during fetch

**`/finance` hub — page Suspense fallback (`FinanceHubFallback`):**

```tsx
<div className="animate-pulse space-y-4 py-6">
  <div className="h-8 w-48 rounded-md bg-muted" />
  …
</div>
```

`app/finance/page.tsx` lines 4–13.

**Hub — billing tab receivables (`FinanceHubReceivablesSection`):**

- Top progress bar: `animate-pulse` strip when `loading` — lines 315–318.
- Empty-data loading: `<Loader2 … /> Loading receivables…` — lines 321–325.
- Idle (not yet loaded): instructional text — lines 330–331.

**Hub — global billing fetch indicator:**

```tsx
{billingLoading ? (
  <div className="mt-2 h-0.5 w-full animate-pulse bg-primary/50" />
) : null}
```

`FinanceHubPageClient.tsx` lines 1155–1157.

**Hub — dynamic tab panels:** `HubPanelFallback` — `animate-pulse` bordered panel (`FinanceHubPageClient.tsx` 87–93), used by `next/dynamic` `loading` option and inner `<Suspense>` (1161–1187).

**`/finance/receivables`:**

- Same spinner pattern as hub billing tab — `ReceivablesPageClient.tsx` 239–243.
- `ReceivablesSummaryStrip` supports `loading` prop with `animate-pulse` KPI placeholders (`components/finance/receivables/ReceivablesSummaryStrip.tsx` 16–17), but the page **does not pass `loading`** — strip only renders when `synced && !loading` (ReceivablesPageClient.tsx 229–235).

**`/finance/forecast/snapshots/variance`:**

- Snapshot selects disabled with placeholder `"Loading…"` while `listLoading` — lines 362–380.
- Compare button shows `<Loader2 … /> Comparing…` while `varianceLoading` — lines 408–411.
- No full-page skeleton; report area empty until compare completes.

### `loading.tsx` / `<Suspense>`

| Route | `loading.tsx` | `<Suspense>` |
|-------|---------------|--------------|
| `/finance` | No | Yes — page wraps `FinanceHubPageClient`; tab panels use Suspense + dynamic loading |
| `/finance/receivables` | No | Yes — `fallback={null}` |
| `/finance/forecast/snapshots/variance` | No | No |

### Rendered content shape (when loaded)

- **Hub**: tabbed layout (Overview, Billing/Receivables, Payables, Accrual, Forecast); filter toolbar; billing tab = nested collapsible month → client → media-plan cards with invoice articles and line items.
- **Receivables page**: header, filter toolbar, 3-column KPI strip, month sections with `ReceivablesClientCard` grids.
- **Forecast variance**: snapshot selectors, compare controls, summary KPI cards, expandable variance table.

### Loading state variables

| Variable | Source | Used for UI? |
|----------|--------|--------------|
| `billingLoading` | `useFinanceStore` | Yes — hub pulse bar |
| `payablesLoading` | `useFinanceStore` | Store only; no dedicated full-page loader found in hub client grep |
| `hubReceivablesLoading` / `loading` | `useReceivablesData` | Yes — spinner + progress bar |
| `hubReceivablesSynced` | derived from `loadedSignature === filterSig` | Yes — idle vs loaded |
| `fetchKey` | `useReceivablesData` | Triggers fetch on bump (Load/Refresh) |
| `listLoading` | `FinanceForecastVariancePageClient` | Yes — select placeholders |
| `varianceLoading` | same | Yes — compare button |

---

## 3. Pacing pages

### Route / file paths (confirmed by glob)

| Route | Files |
|-------|-------|
| `/pacing` | `app/pacing/page.tsx` (redirect → `/pacing/overview`) |
| `/pacing/overview` | `app/pacing/(shell)/overview/page.tsx`, `OverviewClient.tsx` |
| `/pacing/search` | `app/pacing/(shell)/search/page.tsx`, `CampaignsClient.tsx` |
| `/pacing/mappings` | `app/pacing/(shell)/mappings/page.tsx` → `components/pacing/PacingMappingsPageClient.tsx` |
| `/pacing/settings` | `app/pacing/(shell)/settings/page.tsx`, `PacingSettingsClient.tsx` |
| `/pacing/admin/orphans` | `app/pacing/(shell)/admin/orphans/page.tsx`, `OrphansClient.tsx` |
| `/pacing/portfolio` | `app/pacing/portfolio/page.tsx` (server), `app/pacing/components/PacingPageClient.tsx` (client) |
| Shared | `app/pacing/layout.tsx`, `app/pacing/(shell)/layout.tsx`, `app/pacing/loading.tsx` |

### Server vs client component

| Route | Server | Client |
|-------|--------|--------|
| `/pacing/overview` | `page.tsx` (auth + Suspense) | `OverviewClient.tsx` |
| `/pacing/search` | `page.tsx` | `CampaignsClient.tsx` |
| `/pacing/mappings` | `page.tsx` (thin wrapper) | `PacingMappingsPageClient.tsx` |
| `/pacing/settings` | `page.tsx` (auth, admin) | `PacingSettingsClient.tsx` |
| `/pacing/admin/orphans` | `page.tsx` | `OrphansClient.tsx` |
| `/pacing/portfolio` | `portfolio/page.tsx` (SSR data fetch) | `PacingPageClient.tsx` |

### Data fetching — trigger and location

| Route | Mechanism | File + lines |
|-------|-----------|----------------|
| Overview | `useEffect` → `fetch("/api/pacing/campaigns")` | `OverviewClient.tsx` 27–46 |
| Search | Same API | `CampaignsClient.tsx` 18–37 |
| Mappings | `useEffect` → `fetchPacingMappings()` + `/api/clients` + `/api/media_plans` | `PacingMappingsPageClient.tsx` ~159–230 |
| Orphans | `useEffect` → `fetch("/api/pacing/admin/orphans")` | `OrphansClient.tsx` 68–83 |
| Portfolio | Server: `listSavedPacingViewsAction`, `fetchPortfolioPlan`, POST `/api/pacing/portfolio`; Client: `fetch("/api/clients")` | `portfolio/page.tsx`; `PacingPageClient.tsx` 242–270 |
| Settings | Server actions on button click (no initial list fetch) | `PacingSettingsClient.tsx` |

### Loading UI during fetch

**Route-level (`app/pacing/loading.tsx`)** — full Skeleton layout (hero card, 4 KPI blocks, table rows):

Uses `@/components/ui/skeleton` — lines 1–35. Applies to `/pacing/*` segment during Next.js navigation.

**Overview / Search clients:**

```tsx
if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
```

- `OverviewClient.tsx` line 93
- `CampaignsClient.tsx` line 54

Page-level Suspense fallbacks are identical text — `page.tsx` line 13 in each.

**Mappings:**

```tsx
{loading ? (
  <TableRow>
    <TableCell colSpan={14}>Loading mappings…</TableCell>
  </TableRow>
) : …}
```

`PacingMappingsPageClient.tsx` 548–552 — text in table row, not Skeleton.

**Orphans:**

```tsx
if (!orphans) {
  return <div className="p-6 text-sm text-muted-foreground">Loading orphans…</div>;
}
```

`OrphansClient.tsx` 193–195. Assign dialog: `Loader2` spinner — lines 266–269.

**Portfolio (`PacingPageClient`):**

- Summary cards use `<Skeleton className="h-28 w-full rounded-lg" />` ×4 when `isLoading` (`isBusy \|\| clientsLoading`) — lines 761–774.
- Server-side portfolio data arrives with initial HTML (no client loading state for portfolio payload itself when view pre-selected).

**Settings:** inline `Loader2` on action buttons only (`PacingSettingsClient.tsx`); no page-level loading gate.

### `loading.tsx` / `<Suspense>`

| Item | Present? |
|------|----------|
| `app/pacing/loading.tsx` | Yes — Skeleton-based |
| Per-route `loading.tsx` under `(shell)/` | No |
| `<Suspense>` on overview/search pages | Yes — text fallback only |
| Portfolio | No Suspense; server component blocks until data ready |

### Rendered content shape (when loaded)

- **Overview**: header, 5-column status summary grid, `LineItemPacingTable` (or empty state).
- **Search**: “As of” date + `LineItemPacingTable`.
- **Mappings**: filter bar + wide data table (14 columns).
- **Orphans**: HTML table of orphan ad groups.
- **Portfolio**: panel layout with 4 summary cards, client/campaign accordion, delivery drill-down sheets.
- **Settings**: static sections + form controls.

### Loading state variables

| Route | Variables |
|-------|-----------|
| Overview / Search | `loading` (useState) |
| Mappings | `loading` |
| Orphans | `orphans === null` (implicit loading); `lineItemsLoading`, `assignBusy` in dialog |
| Portfolio | `isLoading = isBusy \|\| clientsLoading`; `clientsLoading`, `isBusy` |
| Settings | `busy`, `searchSyncBusy`, `noDeliveryBusy` (button-scoped) |

---

## 4. Repo-wide

### shadcn/ui Skeleton component

**Present:** `components/ui/skeleton.tsx`

```tsx
className={cn("animate-pulse rounded-md bg-muted", className)}
```

### Existing Skeleton usage (import from `@/components/ui/skeleton`)

| File | Usage |
|------|-------|
| `app/pacing/loading.tsx` | Route-level pacing skeleton |
| `app/pacing/components/PacingPageClient.tsx` | Portfolio summary card placeholders |
| `app/mediaplans/[id]/page.tsx` | Detail page skeleton blocks |
| `app/scopes-of-work/page.tsx` | Table row skeletons |
| `components/dashboard/skeletons.tsx` | Reusable `HeroBannerSkeleton`, `CampaignCardSkeleton`, `ChartSkeleton`, `KPICardSkeleton` |
| `components/dashboard/delivery/DeliverySection.tsx` | Delivery KPI/chart skeletons |
| `components/dashboard/delivery/CampaignDeliverySection.tsx` | Large panel skeleton |
| `components/dashboard/ClientKpiSection.tsx` | Card skeletons |
| `components/dashboard/delivery/DeliveryDataProviderWrapper.tsx` | Wrapper skeleton |
| `components/finance/tabs/ForecastTab.tsx` | Forecast tab skeletons |
| `components/pacing/MappingEditor.tsx` | Form field skeletons |
| `components/PublisherKpiForm.tsx` | Card skeletons |
| `components/layout/Panel.tsx` | Panel body skeleton lines |
| `components/ui/sidebar.tsx` | `SidebarMenuSkeleton` |
| `components/ui/MetricCard.tsx` | Metric placeholder |

### `animate-pulse` usage (non-Skeleton component)

Includes finance hub fallbacks, receivables KPI strip, delivery containers, dashboard overview, media-container drag highlights, status badges, `AppSidebar`, `PacingSummaryRow`, and many media expert grids (selection ring animation). Full ripgrep hit list available in repo; not duplicated here.

### Shared / reusable loading components

| Component | Path | Role |
|-----------|------|------|
| `Skeleton` | `components/ui/skeleton.tsx` | shadcn pulse block |
| Dashboard skeletons | `components/dashboard/skeletons.tsx` | Hero, campaign card, chart, KPI |
| `LoadingDots` | `components/ui/loading-dots.tsx` | Three-dot animation |
| `AuthLoadingState` / variants | `components/AuthLoadingState.tsx` | Auth/page/inline loading |
| `SavingModal` | `components/ui/saving-modal.tsx` | Multi-step save progress |
| `MediaPlanLoadStatusPill` | `components/mediaplans/MediaPlanLoadStatusPill.tsx` | MBA edit section load tracker |
| `HubPanelFallback` | inline in `FinanceHubPageClient.tsx` | Finance tab panel placeholder |
| `FinanceHubFallback` | inline in `app/finance/page.tsx` | Finance hub Suspense fallback |
| `MediaContainerSuspenseFallback` | inline in MBA edit `page.tsx` | Per-media spinner row |

### Tailwind config and `animate-pulse`

- **Config file:** `tailwind.config.js` (present).
- **`animate-pulse`:** Available. Tailwind’s default `pulse` keyframe is included via `tailwindcss-animate` plugin (line 195). Config extends custom animations (`fade-in`, `slide-up`, `pulse-slow`, `shimmer`) but does not remove default utilities. The Skeleton component relies on `animate-pulse` directly.

---

## 5. Gaps and unconfirmed

| Item | Status |
|------|--------|
| MBA edit `loading` state (useState) driving UI | **NOT USED** in JSX — only `loadPhase` / `isLoading` / `mediaLoadStatus` drive visible loading |
| `MediaPlanLoadModal` on MBA edit page | **Imported but not rendered** |
| `ReceivablesSummaryStrip` skeleton `loading` prop | **Supported in component but not passed** from `ReceivablesPageClient` |
| Dedicated `loading.tsx` for finance routes | **NOT FOUND** |
| Per-shell-route `loading.tsx` under `app/pacing/(shell)/` | **NOT FOUND** (only parent `app/pacing/loading.tsx`) |
| Whether Next.js `loading.tsx` on MBA edit shows after client bundle loads | **UNCONFIRMED** — client page immediately re-enters `loadPhase === "bootstrapping"`; interaction between route loader and client phase not measured at runtime (dev server not started per instructions) |
| Payables tab full-page loading UI | **UNCONFIRMED** — `payablesLoading` exists in store; no explicit spinner block found in `FinanceHubPageClient` grep (may rely on dynamic panel / empty data) |
