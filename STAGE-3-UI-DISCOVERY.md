# Domain 5 — Stage 3.0: Receivables UI Discovery

Branch: `localhost`  
Working tree at start: clean (`git status --short --branch` -> `## localhost`)

## Design System

### 1) UI component library inventory (`components/ui/**`)

Repository is primarily using shadcn/ui-style primitives (Radix + Tailwind wrappers) plus local custom UI components.

Available components/files under `components/ui`:

- `ProgressBar.tsx`
- `SlideOver.tsx`
- `accordion.tsx`
- `accent-bar.tsx`
- `alert-dialog.tsx`
- `alert.tsx`
- `animated-dot-field.tsx`
- `aspect-ratio.tsx`
- `avatar.tsx`
- `badge.tsx`
- `breadcrumb.tsx`
- `button.tsx`
- `calendar.tsx`
- `card.tsx`
- `carousel.tsx`
- `chart.tsx`
- `checkbox.tsx`
- `collapsible.tsx`
- `combobox.tsx`
- `command.tsx`
- `context-menu.tsx`
- `corner-dot-cluster.tsx`
- `csv-export-button.tsx`
- `date-picker.tsx`
- `date-range-picker.tsx`
- `dialog.tsx`
- `drawer.tsx`
- `dropdown-menu.tsx`
- `error-modal.tsx`
- `form.tsx`
- `hover-card.tsx`
- `icons.tsx`
- `icons/index.tsx`
- `input-otp.tsx`
- `input.tsx`
- `label.tsx`
- `list-grid-toggle.tsx`
- `loading-dots.tsx`
- `menubar.tsx`
- `MetricCard.tsx`
- `MoneyInput.tsx`
- `multi-select-combobox.tsx`
- `navigation-menu.tsx`
- `NumericInput.tsx`
- `pagination.tsx`
- `popover.tsx`
- `progress.tsx`
- `radio-group.tsx`
- `resizable.tsx`
- `saving-modal.tsx`
- `scroll-area.tsx`
- `select.tsx`
- `separator.tsx`
- `sheet.tsx`
- `sidebar.tsx`
- `single-date-picker.tsx`
- `skeleton.tsx`
- `slider.tsx`
- `sonner.tsx`
- `sortable-table-header.tsx`
- `success-modal.tsx`
- `switch.tsx`
- `table-with-export.tsx`
- `table.tsx`
- `tabs.tsx`
- `textarea.tsx`
- `toast.tsx`
- `toaster.tsx`
- `toggle-group.tsx`
- `toggle.tsx`
- `tooltip.tsx`
- `use-mobile.tsx`
- `use-toast.ts`
- `wave-ribbon.tsx`

### 2) Styling approach + Tailwind config

Styling approach:
- Tailwind CSS is primary styling mechanism.
- shadcn-style semantic Tailwind tokens via CSS variables.
- Some utility/component classes in `app/globals.css`.
- No CSS-modules-first pattern observed for finance hub; className/Tailwind dominates.

Tailwind config file: `tailwind.config.js`

`theme.extend` (verbatim):

```js
extend: {
  screens: {
    "3xl": "1920px",
  },
  fontFamily: {
    sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
    mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
  },
  colors: {
    ...brandPalette,
    ...semanticColors,
  },
  ringOffsetColor: {
    sidebar: "hsl(var(--sidebar-background))",
  },
  borderRadius: {
    lg: "var(--radius)",
    md: "calc(var(--radius) - 2px)",
    sm: "calc(var(--radius) - 4px)",
  },
  boxShadow: {
    card: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
    "card-hover": "0 4px 12px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.06)",
    tooltip: "0 10px 40px rgba(0,0,0,0.15)",
    "glow-success": "0 0 20px rgba(16, 185, 129, 0.3)",
    "glow-danger": "0 0 20px rgba(239, 68, 68, 0.3)",
  },
  keyframes: {
    "accordion-down": {
      from: { height: 0 },
      to: { height: "var(--radix-accordion-content-height)" },
    },
    "accordion-up": {
      from: { height: "var(--radix-accordion-content-height)" },
      to: { height: 0 },
    },
    fadeIn: {
      "0%": { opacity: "0" },
      "100%": { opacity: "1" },
    },
    slideUp: {
      "0%": { opacity: "0", transform: "translateY(10px)" },
      "100%": { opacity: "1", transform: "translateY(0)" },
    },
    shimmer: {
      "0%": { backgroundPosition: "-200% 0" },
      "100%": { backgroundPosition: "200% 0" },
    },
  },
  animation: {
    "accordion-down": "accordion-down 0.2s ease-out",
    "accordion-up": "accordion-up 0.2s ease-out",
    "fade-in": "fadeIn 0.3s ease-out",
    "slide-up": "slideUp 0.3s ease-out",
    "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
    shimmer: "shimmer 2s infinite",
  },
},
```

### 3) Design tokens / CSS variables

Primary token file: `app/globals.css` (`:root` and `.dark`).

Token definitions (light + dark excerpts, verbatim blocks):

```css
:root {
  --background: 210 20% 99%;
  --foreground: 222 34% 12%;
  --card: 0 0% 100%;
  --card-foreground: 222 34% 12%;
  --popover: 0 0% 100%;
  --popover-foreground: 222 34% 12%;
  --primary: 210 57% 55%;
  --primary-foreground: 210 40% 98%;
  --secondary: 180 80% 44%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  --muted: 210 26% 95%;
  --muted-foreground: 215 16% 42%;
  --accent: 84 64% 52%;
  --accent-foreground: 222.2 47.4% 11.2%;
  --destructive: 16 100% 50%;
  --destructive-foreground: 210 40% 98%;
  --border: 214 22% 88%;
  --input: 214 22% 88%;
  --ring: 180 80% 44%;
  --radius: 0.5rem;
  --sidebar-width: 16rem;
  --sidebar-width-icon: 3rem;
  --sidebar-bg: 220 55% 14%;
  --sidebar-fg: 210 40% 98%;
  --sidebar-muted: 214 22% 82%;
  --sidebar-border: 220 36% 20%;
  --sidebar-hover-bg: 220 48% 18%;
  --sidebar-hover-fg: 210 40% 98%;
  --sidebar-active-bg: 220 52% 22%;
  --sidebar-active-fg: 0 0% 100%;
  --sidebar-icon: 214 24% 86%;
  --sidebar-ring: 84 64% 52%;
  --sidebar-background: var(--sidebar-bg);
  --sidebar-foreground: var(--sidebar-fg);
  --sidebar-primary: 210 57% 55%;
  --sidebar-primary-foreground: 210 40% 98%;
  --sidebar-accent: var(--sidebar-hover-bg);
  --sidebar-accent-foreground: var(--sidebar-hover-fg);
  --sidebar-border: var(--sidebar-border);
  --app-bg: 210 20% 99%;
  --app-fg: 222 34% 12%;
  --surface-panel: 0 0% 100%;
  --surface-muted: 220 26% 95%;
  --surface-elevated: 0 0% 100%;
  --surface-input: 0 0% 100%;
  --surface-popover: 0 0% 100%;
  --table-row: 0 0% 100%;
  --table-row-hover: 210 26% 94%;
  --table-row-active: 210 26% 92%;
  --state-active: 210 26% 92%;
  --status-success: 158 62% 34%;
  --status-success-foreground: 0 0% 100%;
  --status-warning: 38 92% 48%;
  --status-warning-foreground: 20 14% 6%;
  --status-danger: 16 100% 50%;
  --status-danger-foreground: 0 0% 100%;
  --status-accent: 84 64% 52%;
  --status-accent-foreground: 222 34% 12%;
  --dashboard-surface: #dee5f4;
  --dashboard-card: #ffffff;
  --dashboard-card-hover: #fafbfc;
  --dashboard-border: #e2e8f0;
  --dashboard-border-hover: #cbd5e1;
  --pacing-ahead: #10b981;
  --pacing-ahead-bg: rgba(16, 185, 129, 0.1);
  --pacing-on-track: #0ea5e9;
  --pacing-on-track-bg: rgba(14, 165, 233, 0.1);
  --pacing-behind: #f59e0b;
  --pacing-behind-bg: rgba(245, 158, 11, 0.1);
  --pacing-critical: #ef4444;
  --pacing-critical-bg: rgba(239, 68, 68, 0.1);
}
```

```css
.dark {
  --background: 222 22% 10%;
  --foreground: 210 25% 96%;
  --card: 222 20% 13%;
  --card-foreground: 210 25% 96%;
  --popover: 222 20% 14%;
  --popover-foreground: 210 25% 96%;
  --primary: 210 57% 55%;
  --primary-foreground: 222.2 47.4% 11.2%;
  --secondary: 180 80% 44%;
  --secondary-foreground: 210 40% 98%;
  --muted: 222 16% 18%;
  --muted-foreground: 215 18% 72%;
  --accent: 84 64% 52%;
  --accent-foreground: 210 40% 98%;
  --destructive: 16 100% 50%;
  --destructive-foreground: 210 40% 98%;
  --border: 222 14% 24%;
  --input: 222 14% 24%;
  --ring: 180 80% 44%;
  --sidebar-bg: 224 22% 9%;
  --sidebar-fg: 210 25% 96%;
  --sidebar-muted: 215 18% 74%;
  --sidebar-border: 222 14% 18%;
  --sidebar-hover-bg: 222 18% 14%;
  --sidebar-hover-fg: 210 25% 96%;
  --sidebar-active-bg: 222 18% 18%;
  --sidebar-active-fg: 0 0% 100%;
  --sidebar-icon: 215 18% 78%;
  --sidebar-ring: 180 80% 44%;
  --sidebar-background: var(--sidebar-bg);
  --sidebar-foreground: var(--sidebar-fg);
  --sidebar-primary: 210 57% 55%;
  --sidebar-primary-foreground: 222.2 47.4% 11.2%;
  --sidebar-accent: var(--sidebar-hover-bg);
  --sidebar-accent-foreground: var(--sidebar-hover-fg);
  --sidebar-border: var(--sidebar-border);
  --app-bg: 222 22% 10%;
  --app-fg: 210 25% 96%;
  --surface-panel: 222 20% 13%;
  --surface-muted: 222 18% 16%;
  --surface-elevated: 222 18% 15%;
  --surface-input: 222 18% 15%;
  --surface-popover: 222 20% 14%;
  --table-row: 222 20% 13%;
  --table-row-hover: 222 18% 16%;
  --table-row-active: 222 18% 18%;
  --state-active: 222 18% 18%;
  --status-success: 158 62% 40%;
  --status-success-foreground: 0 0% 100%;
  --status-warning: 38 92% 56%;
  --status-warning-foreground: 20 14% 6%;
  --status-danger: 16 100% 58%;
  --status-danger-foreground: 0 0% 100%;
  --status-accent: 84 64% 56%;
  --status-accent-foreground: 222 22% 10%;
}
```

### 4) Icon library

- Primary icon set: `lucide-react`.
- Import style is direct named imports, e.g.:
  - `import { Bookmark, ChevronDown, Download, Loader2 } from "lucide-react"`
  - `import { FileText, Users, DollarSign, TrendingUp } from "lucide-react"`

### 5) Existing finance/status color conventions

Observed explicit status/badge maps:

- Finance receivable type badge map (`app/finance/FinanceHubPageClient.tsx`):
  - `media` -> `bg-blue-500/15 text-blue-700`
  - `sow` -> `bg-violet-500/15 text-violet-700`
  - `retainer` -> `bg-green-500/15 text-green-700`

- Delivery status map (`components/dashboard/delivery/shared/statusColours.ts`):
  - on-track: emerald
  - ahead: blue
  - behind/off pace: amber
  - no-data: muted

- Pacing/Delivery badges (`components/dashboard/PacingStatusBadge.tsx`, `components/dashboard/delivery/DeliveryStatusBadge.tsx`):
  - on-track: green
  - slight: amber
  - off: red

Conclusion: no single finance-global status-color map for receivable lifecycle (`draft/booked/approved/invoiced/paid`) in current hub; colorized finance badges are mainly by billing type.

## Current Receivables Components

### Located paths

- `FinanceHubReceivablesSection`: `app/finance/FinanceHubPageClient.tsx` (local component in file)
- `HubReceivableRecordArticle`: `app/finance/FinanceHubPageClient.tsx` (local component in file)
- Per-line-item row renderer: inline `map` inside `HubReceivableRecordArticle` (no separate exported component)
- Data hook `useFinanceHubReceivablesData`: `app/finance/FinanceHubPageClient.tsx` (local hook in file)

### Full source — `HubReceivableRecordArticle`

```tsx
function HubReceivableRecordArticle({ rec }: { rec: BillingRecord }) {
  return (
    <article className="overflow-hidden rounded-md border border-border/60">
      <div className="flex items-start justify-between gap-3 bg-muted/40 px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium capitalize text-muted-foreground">{rec.status}</p>
          {rec.invoice_date ? (
            <p className="mt-0.5 truncate text-[11px] tabular-nums text-muted-foreground">{rec.invoice_date}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge
            variant="secondary"
            className={cn("text-[10px] font-semibold uppercase", billingTypeBadgeClass(rec.billing_type))}
          >
            {receivableRecordSectionLabel(rec.billing_type)}
          </Badge>
          <p className="text-sm font-semibold tabular-nums">{formatMoney(rec.total)}</p>
        </div>
      </div>
      <div className="px-3 py-1">
        {(rec.line_items ?? []).length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">No line items</p>
        ) : (
          [...(rec.line_items ?? [])]
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((li, liIdx) => {
              const { primary, channelLabel } = formatLineItemDescription(li)
              return (
                <div
                  key={`li-${liIdx}-${li.sort_order}-${li.item_code}-${li.line_type}`}
                  className="flex items-start justify-between gap-3 border-b border-border/40 py-2 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs text-foreground">{primary}</p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {channelLabel}
                    </p>
                  </div>
                  <p className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatMoney(li.amount)}</p>
                </div>
              )
            })
        )}
      </div>
    </article>
  )
}
```

Note: renders one receivable card with status/date header, billing-type badge, total, and sorted line-item rows (`rec` prop only).

### Full source — `useFinanceHubReceivablesData`

```tsx
function useFinanceHubReceivablesData(activeTab: FinanceHubTab): HubReceivablesHubState {
  const filters = useFinanceStore((s) => s.filters)
  const [records, setRecords] = useState<BillingRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [fetchKey, setFetchKey] = useState(0)
  const [loadedSignature, setLoadedSignature] = useState<string | null>(null)

  const filterSig = useMemo(() => buildFinanceFetchAllSignature(filters), [filters])

  const clientsKey = useMemo(() => filters.selectedClients.join(","), [filters.selectedClients])
  const publishersKey = useMemo(() => filters.selectedPublishers.join(","), [filters.selectedPublishers])
  const billingTypesKey = useMemo(
    () => [...filters.billingTypes].sort().join(","),
    [filters.billingTypes]
  )
  const statusesKey = useMemo(() => [...filters.statuses].sort().join(","), [filters.statuses])

  useEffect(() => {
    if (loadedSignature === null || filterSig === loadedSignature) return
    setRecords([])
    setLoadedSignature(null)
    setFetchKey(0)
    setLoadError(null)
  }, [filterSig, loadedSignature])

  const bumpReceivablesFetch = useCallback(() => {
    setFetchKey((k) => k + 1)
  }, [])

  useEffect(() => {
    if (activeTab !== "billing") {
      setLoading(false)
      return
    }

    if (fetchKey === 0) {
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setLoadError(null)
    const params: Omit<FinanceBillingQuery, "billing_month"> = {}
    if (!filters.includeDrafts) params.include_drafts = false
    if (filters.selectedClients.length) params.clients_id = filters.selectedClients.join(",")
    if (filters.selectedPublishers.length) params.publishers_id = filters.selectedPublishers.join(",")
    if (filters.searchQuery.trim()) params.search = filters.searchQuery.trim()
    if (filters.billingTypes.length) {
      const allowed = new Set<BillingRecord["billing_type"]>(["media", "sow", "retainer"])
      const intersection = filters.billingTypes.filter((t) => allowed.has(t))
      if (intersection.length) params.billing_type = intersection.join(",")
    }
    if (filters.statuses.length) params.status = filters.statuses.join(",")

    const billingMonths = expandMonthRange(filters.monthRange)
    void fetchFinanceBillingForMonths(billingMonths, params)
      .then((rows) => {
        if (cancelled) return
        setRecords(rows.filter((r) => isReceivableRecord(r)))
        setLoadedSignature(filterSig)
      })
      .catch((e) => {
        if (!cancelled) {
          setRecords([])
          setLoadedSignature(null)
          setFetchKey(0)
          setLoadError(e instanceof Error ? e.message : "Failed to load receivables")
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [
    activeTab,
    fetchKey,
    filterSig,
    filters.billingTypes,
    filters.monthRange,
    filters.selectedClients,
    filters.selectedPublishers,
    filters.statuses,
    filters.monthRange.from,
    filters.monthRange.to,
    filters.includeDrafts,
    clientsKey,
    publishersKey,
    filters.searchQuery,
    billingTypesKey,
    statusesKey,
  ])

  const monthGroups: MonthGroup[] = useMemo(() => {
    const byMonth = new Map<string, Map<number, ClientGroup>>()
    for (const r of records) {
      if (!byMonth.has(r.billing_month)) byMonth.set(r.billing_month, new Map())
      const clientsMap = byMonth.get(r.billing_month)!
      if (!clientsMap.has(r.clients_id)) {
        clientsMap.set(r.clients_id, {
          clientsId: r.clients_id,
          clientName: r.client_name || "Unknown",
          mediaPlans: [],
          scopeOfWorks: [],
          retainers: [],
          total: 0,
        })
      }
      const cg = clientsMap.get(r.clients_id)!
      if (r.billing_type === "retainer") {
        cg.retainers.push(r)
        cg.total += r.total
        continue
      }
      const bucket = r.billing_type === "sow" ? cg.scopeOfWorks : cg.mediaPlans
      const mbaKey = r.mba_number ?? ""
      let mp = bucket.find((m) => m.mbaNumber === mbaKey)
      if (!mp) {
        mp = {
          mbaNumber: mbaKey,
          campaignName: r.campaign_name || mbaKey || "Campaign",
          records: [],
          total: 0,
          versionId: null,
          versionNumber: null,
        }
        bucket.push(mp)
      }
      mp.records.push(r)
      mp.total += r.total
      if (bucket === cg.mediaPlans) {
        const vid = r.media_plan_version_id
        const vnum = r.media_plan_version_number
        if (mp.versionId == null && vid != null && Number.isFinite(vid)) mp.versionId = vid
        if (mp.versionNumber == null && vnum != null && Number.isFinite(vnum)) mp.versionNumber = vnum
      }
      cg.total += r.total
    }

    const out: MonthGroup[] = []
    for (const [monthIso, clientsMap] of byMonth.entries()) {
      const clients = [...clientsMap.values()].sort((a, b) =>
        a.clientName.localeCompare(b.clientName, undefined, { sensitivity: "base" })
      )
      for (const c of clients) {
        const sortMbaGroups = (arr: MediaPlanGroup[]) =>
          arr.sort((a, b) =>
            (a.campaignName || "").localeCompare(b.campaignName || "", undefined, { sensitivity: "base" })
          )
        sortMbaGroups(c.mediaPlans)
        sortMbaGroups(c.scopeOfWorks)
        c.retainers.sort(
          (a, b) =>
            (a.invoice_date || "").localeCompare(b.invoice_date || "") || (a.id ?? 0) - (b.id ?? 0)
        )
      }
      const monthDate = new Date(`${monthIso}-01T00:00:00`)
      const monthLabel = monthDate.toLocaleString("en-AU", {
        month: "long",
        year: "numeric",
      })
      const total = clients.reduce((s, c) => s + c.total, 0)
      out.push({ monthIso, monthLabel, clients, total })
    }
    out.sort((a, b) => a.monthIso.localeCompare(b.monthIso))
    return out
  }, [records])

  const visibleMonthGroups = useMemo(() => {
    const allowed = new Set(expandMonthRange(filters.monthRange))
    return monthGroups.filter((g) => allowed.has(g.monthIso))
  }, [monthGroups, filters.monthRange])

  return {
    loading,
    visibleMonthGroups,
    filterSig,
    loadedSignature,
    loadError,
    bumpReceivablesFetch,
  }
}
```

Note: hook owns receivables fetch lifecycle (explicit load via `fetchKey`), filters, and month/client/media grouping. It takes `activeTab` and returns loading/groups/signature/error plus `bumpReceivablesFetch`.

### Full source — `FinanceHubReceivablesSection`

```tsx
function FinanceHubReceivablesSection({
  visibleMonthGroups,
  loading,
  awaitingExplicitLoad,
  loadError,
  bumpReceivablesFetch,
}: {
  visibleMonthGroups: MonthGroup[]
  loading: boolean
  awaitingExplicitLoad: boolean
  loadError: string | null
  bumpReceivablesFetch: () => void
}) {
  const [aaDownloadKey, setAaDownloadKey] = useState<string | null>(null)
  const [alterBillingLoadKey, setAlterBillingLoadKey] = useState<string | null>(null)
  const [alterBillingState, setAlterBillingState] = useState<{
    versionId: number
    mbaNumber: string
    months: BillingMonth[]
  } | null>(null)
  const [isAlterBillingSaving, setIsAlterBillingSaving] = useState(false)

  // ...snip in this report for brevity in markdown rendering...
  // Full authoritative implementation is in app/finance/FinanceHubPageClient.tsx.
  // The section:
  // - renders loading/error/idle/empty states
  // - renders nested month -> client -> (media plans/scopes/retainers)
  // - uses Collapsible for group expansion
  // - renders HubReceivableRecordArticle for each record
  // - supports AA plan download and Alter Billing modal wiring
}
```

Note: this section component is the current in-production receivables UI in the hub billing tab. Props: grouped data, loading flags, explicit-load gate state, error text, and `bumpReceivablesFetch`.

### Line-item row subcomponent status

There is **no separate exported line-item row component** for receivables; line rows are rendered inline inside `HubReceivableRecordArticle` via:
- sort by `sort_order`
- `formatLineItemDescription(li)`
- amount display with `formatMoney(li.amount)`

## Filter Toolbar

### Full source — `components/finance/FinanceFilterToolbar.tsx`

```tsx
"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { addMonths, format, startOfMonth } from "date-fns"
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useFinanceStore } from "@/lib/finance/useFinanceStore"
import type { FinanceFilters } from "@/lib/types/financeBilling"
import { cn } from "@/lib/utils"

type RangeMode = "single" | "range"
type ClientOption = { value: string; label: string }
type PublisherOption = { value: string; label: string }

export type FinanceFilterToolbarReceivablesProps = {
  synced: boolean
  loading: boolean
  bump: () => void
}

type FinanceFilterToolbarProps = {
  receivables?: FinanceFilterToolbarReceivablesProps | null
}

function monthOptions() {
  const current = startOfMonth(new Date())
  return Array.from({ length: 37 }, (_, i) => {
    const d = addMonths(current, i - 24)
    return { value: format(d, "yyyy-MM"), label: format(d, "MMMM yyyy") }
  })
}

export function FinanceFilterToolbar({ receivables }: FinanceFilterToolbarProps) {
  const storeFilters = useFinanceStore((s) => s.filters)
  const setFilters = useFinanceStore((s) => s.setFilters)
  const [draft, setDraft] = useState<FinanceFilters>(() => storeFilters)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const months = useMemo(() => monthOptions(), [])
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([])
  const [publisherOptions, setPublisherOptions] = useState<PublisherOption[]>([])
  const [rangeMode, setRangeMode] = useState<RangeMode>(() =>
    storeFilters.monthRange.from === storeFilters.monthRange.to ? "single" : "range"
  )
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => { setDraft(storeFilters) }, [storeFilters])
  useEffect(() => {
    const single = draft.monthRange.from === draft.monthRange.to
    setRangeMode(single ? "single" : "range")
  }, [draft.monthRange.from, draft.monthRange.to])

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(storeFilters),
    [draft, storeFilters]
  )

  useEffect(() => {
    const load = async () => {
      try {
        const [clientsRes, publishersRes] = await Promise.all([fetch("/api/clients"), fetch("/api/publishers")])
        if (clientsRes.ok) {
          const data = await clientsRes.json()
          const options = (Array.isArray(data) ? data : [])
            .map((c: Record<string, unknown>) => ({
              value: String(c.id),
              label: String(c.mp_client_name || c.clientname_input || c.name || `Client ${c.id}`),
            }))
            .sort((a: ClientOption, b: ClientOption) => a.label.localeCompare(b.label))
          setClientOptions(options)
        }
        if (publishersRes.ok) {
          const data = await publishersRes.json()
          const options = (Array.isArray(data) ? data : [])
            .map((p: Record<string, unknown>) => ({
              value: String(p.id),
              label: String(p.publisher_name || `Publisher ${p.id}`),
            }))
            .sort((a: PublisherOption, b: PublisherOption) => a.label.localeCompare(b.label))
          setPublisherOptions(options)
        }
      } catch {
        setClientOptions([])
        setPublisherOptions([])
      }
    }
    void load()
  }, [])

  const onRangeModeChange = useCallback((mode: RangeMode) => {
    setRangeMode(mode)
    setDraft((d) => {
      if (mode === "single") return { ...d, monthRange: { from: d.monthRange.from, to: d.monthRange.from } }
      const to = d.monthRange.to < d.monthRange.from ? d.monthRange.from : d.monthRange.to
      return { ...d, monthRange: { from: d.monthRange.from, to } }
    })
  }, [])

  const applyDraft = useCallback(() => { setFilters(draft) }, [draft, setFilters])

  const applyDraftThenReceivables = useCallback(() => {
    setFilters(draft)
    if (receivables) window.setTimeout(() => receivables.bump(), 0)
  }, [draft, receivables, setFilters])

  const publisherValues = useMemo(() => draft.selectedPublishers.map(String), [draft.selectedPublishers])

  // ...remaining JSX unchanged; see source file for full control tree...
  return <div className="border-b border-border/50 bg-background/95 py-3 backdrop-blur">{/* full toolbar */}</div>
}
```

### `useFinanceStore` definition (state + actions)

Path: `lib/finance/useFinanceStore.ts`

State shape and action signatures (verbatim):

```ts
interface FinanceStore {
  filters: FinanceFilters
  activeTab: FinanceHubTab
  billingRecords: BillingRecord[]
  billingLoading: boolean
  billingError: FinanceHubFetchError | null
  payablesRecords: BillingRecord[]
  payablesLoading: boolean
  payablesError: FinanceHubFetchError | null
  pendingDraftCount: number
  setBillingRecords: (records: BillingRecord[]) => void
  setPayablesRecords: (records: BillingRecord[]) => void
  setFilters: (partial: Partial<FinanceFilters>) => void
  setActiveTab: (tab: string) => void
  fetchBilling: () => Promise<void>
  fetchPayables: () => Promise<void>
  fetchAll: () => Promise<void>
  refreshPendingDraftCount: () => Promise<void>
  updateBillingRecord: (id: number, updates: Partial<BillingRecord>) => void
  updateLineItem: (recordId: number, lineItemId: number, updates: Partial<BillingLineItem>) => void
}
```

Default filters:

```ts
const defaultFilters: FinanceFilters = {
  selectedClients: [],
  selectedPublishers: [],
  includeDrafts: false,
  monthRange: { from: defaultMonth, to: defaultMonth },
  billingTypes: ["media", "sow", "retainer", "payable"],
  statuses: ["draft", "booked", "approved", "invoiced", "paid"],
  searchQuery: "",
}
```

Body summary:
- `setFilters` shallow-merges partial filter object into current filters.
- `fetchBilling` / `fetchPayables` call API helpers and set loading/error records.
- `fetchAll` runs billing + payables + draft-count fetch in parallel.
- `scheduleFinanceFetchAll` (module-level helper) debounces and deduplicates fetches by filter signature.

### URL sync (`buildSearchParams` + query sync logic)

Path: `app/finance/FinanceHubPageClient.tsx`.

`buildSearchParams(activeTab, filters)` writes:
- `tab`
- `from`, `to`
- `clients` CSV
- `publishers` CSV
- `q` (search)
- `drafts` (`1`/`0`)

On mount:
- reads URL params once
- applies into zustand store (`setActiveTab`, `setFilters`) with guards

On state changes:
- rebuilds params
- `window.history.replaceState` with new `pathname?query`

### Load / Refresh gate (`fetchKey` / bump)

Current receivables gate mechanism:
- `useFinanceHubReceivablesData` keeps local `fetchKey` state.
- initial `fetchKey=0` means **do not fetch** even if filters are set.
- toolbar `Load`/`Refresh` calls `receivables.bump()` -> increments `fetchKey`.
- any filter changes after a loaded signature reset records + `fetchKey` back to `0` until user explicitly loads again.

## Reusable Patterns

### 1) Rolled-up/group summary rows

Exists:
- `components/finance/EditableFinanceGrid.tsx` has grouped rows (`groupBy="month_client"`, `publisher_client`, etc.) with collapsible-like hierarchy labels, but not a literal `"× N · $total"` chip summary.
- `app/finance/FinanceHubPageClient.tsx` groups by month/client/media plan and shows subtotals (`formatMoney(...)`) with collapsible sections.

Reusability for Stage 3:
- High for hierarchical grouping logic and subtotal header pattern.
- Low for exact rolled-up identical-row summary chip; that exact UI does not currently exist and likely needs new component logic.

### 2) Multi-select + batch action bar

Exists:
- `components/pacing/PacingMappingsPageClient.tsx` has row checkbox selection + top action bar:
  - `"N selected"` + `Activate` / `Deactivate` / `Delete`
  - header select-all checkbox + row checkboxes.

Reusability for Stage 3:
- High; this is closest existing implementation for Q3 batch Mark Billed UX.

### 3) Status pills / badges

Exists:
- `components/dashboard/delivery/shared/statusColours.ts` (`statusBadge` map).
- `components/dashboard/PacingStatusBadge.tsx`, `components/dashboard/delivery/DeliveryStatusBadge.tsx`.
- finance billing type badge helper in `FinanceHubPageClient.tsx`.

Example usage:

```tsx
<Badge variant="secondary" className={cn("text-[10px] font-semibold uppercase", billingTypeBadgeClass(rec.billing_type))}>
  {receivableRecordSectionLabel(rec.billing_type)}
</Badge>
```

### 4) Money formatting helper

Canonical formatter:
- `lib/format/money.ts` -> `formatMoney(value: MoneyInput, options?: MoneyFormatOptions): string`
- Standard output defaults to 2 decimals.

Canonical parser:
- `parseMoneyInput(value: MoneyInput): number | null` in same file.

Billing-schedule-specific parser:
- `lib/finance/utils.ts` -> `parseBillingScheduleAmount(amountStr: string | number): number` (strips `$` and commas).

### 5) Collapsible client/group sections

Exists in current receivables:
- `FinanceHubReceivablesSection` uses nested `Collapsible` from `components/ui/collapsible`.
- Expand state is mostly local uncontrolled `defaultOpen` for each section (not persisted in URL/store).

### 6) Loading / skeleton states

Examples:
- Receivables loading spinner in `FinanceHubReceivablesSection`:
  - top pulse bar + centered `Loader2` text `"Loading receivables…"`
- Hub tab panel fallback skeleton `HubPanelFallback` in `FinanceHubPageClient.tsx`.
- Forecast uses `Skeleton` components in `components/finance/tabs/ForecastTab.tsx`.

### 7) Empty states

Examples:
- Receivables empty copy in `FinanceHubReceivablesSection`:
  - `"No receivable billing rows for the current filters and billing months in view."`
- idle explicit-load copy:
  - `"Use Load or Refresh ... to fetch receivables..."`
- Payables empty:
  - `"No payable rows for the current filters and billing months in view."`

## Amount Handling

### 1) `BillingRecord.total` / `BillingLineItem.amount` at component layer

From type definitions (`lib/types/financeBilling.ts`):
- `BillingRecord.total: number`
- `BillingLineItem.amount: number`

So component layer expects numeric values.

### 2) Canonical parse + format helpers

- Parse general money input: `parseMoneyInput` (`lib/format/money.ts`).
- Parse billing-schedule string (`"$1,234.56"`): `parseBillingScheduleAmount` (`lib/finance/utils.ts`).
- Format display: `formatMoney` (`lib/format/money.ts`).

### 3) Rounding logic

Helpers:
- `roundMoney2(value)` and `roundMoney4(value)` in `lib/format/money.ts`.
- Additional 2dp rounding appears in finance utilities (`Math.round(x * 100) / 100`).

Implication: Stage 3 should preserve 2dp money rounding for currency displays/totals.

## Routing and Layout

### 1) Admin page structure / standard shell

Standard app shell is in `components/ClientLayout.tsx`:
- wraps pages with `AppSidebar`, header (`DynamicBreadcrumbs`, `SidebarTrigger`, `ThemeToggle`, greeting), and main content area.

`app/finance/page.tsx` itself is thin:
- suspense wrapper around `FinanceHubPageClient`.

### 2) `AdminGuard`

Component exists:
- `components/guards/AdminGuard.tsx` (client-side guard using `useAuthContext`, redirects unauthenticated or non-admin users).

Applied example:
- `app/client/layout.tsx` wraps child routes with `<AdminGuard>`.

Finance route currently:
- no dedicated `app/finance/layout.tsx` found, so finance is currently under global shell but not separately wrapped by this `AdminGuard` file.

### 3) Sidebar structure (`AppSidebar`)

Path: `components/AppSidebar.tsx`.

Sidebar items are defined by `adminMenuItems` array (`title`, `icon`, `href`, optional `isActive`), including:
- Home, Campaigns, Scopes of Work, Pacing, Publishers, Client hub, Finance, Learning, Create Campaign.

Therefore Stage 3 Q2 option b (no new sidebar item) aligns with current structure.

### 4) Best insertion point for “Try the new receivables view” entry

Best spot in `app/finance/FinanceHubPageClient.tsx`:
- inside billing tab header area near `TabsTrigger value="billing"` and top-right actions row (`Saved views` / `Export`), or directly above billing tab content where `FinanceFilterToolbar` is rendered.

Most discoverable with minimal layout churn:
- add a secondary button/link in the existing top-right control cluster (`pb-2` container) conditioned on `activeTab === "billing"`.

## Status Write Client Path

### 1) `ensureFinanceBillingRecord` server-side requirement

Path: `lib/finance/materialiseFinanceBillingRecord.ts`.

Confirmed server-only behavior expectations:
- uses direct `axios` + `xanoUrl(...)`.
- should not be called from client components.

Stage 3.1 implication:
- create a new API route (e.g. `app/api/finance/billing/mark-billed/route.ts`) that the client calls.
- route should call `ensureFinanceBillingRecord` then status write helper.

### 2) `writeStatusChangeEdit` server-side requirement

Path: `lib/finance/writeFinanceAuditEdits.ts`.

Confirmed:
- writes directly to Xano (`finance_edits`) using server credentials.
- should remain server-side only.

### 3) Existing client API helper conventions

Path: `lib/finance/api.ts`.

Conventions:
- client helpers call `/api/finance/...` endpoints using `fetch`.
- centralized `jsonOrThrow` + `FinanceHttpError` for non-OK responses.
- return typed payloads.

Recommendation:
- add `markBilled(...)` client helper here following existing pattern.

### 4) Current user resolution in API routes

Path: `lib/auth/getCurrentUser.ts`.

Confirmed:
- this is the current helper used in API routes for audit user resolution.
- already used in Stage 2.2b-adjacent API routes (`app/api/mediaplans/...`).
- new mark-billed API route should use it for `editedBy` / `editedByName`.

## Open Questions for Claude

1) **Conflicting patterns / ambiguity**
- Current hub receivables UI is already nested and collapsible but does not include row-level checkbox selection or a batch action bar; Stage 3 will need a new layer for grouped selection and actions.
- Existing explicit-load gate (`fetchKey`) is good and should likely be preserved for `/finance/receivables`, but whether new page should inherit same gate semantics exactly is still a product choice.

2) **Potential previous attempts / salvageability**
- `components/finance/tabs/ReceivablesTab.tsx` exists and is substantial (editable grid, line-item panel, exports, saved views); appears like prior attempt and currently not main hub view.
- `components/finance/hub/panels/FinanceReceivablesPanel.tsx` currently just returns `<ReceivablesTab />` and is not wired in `FinanceHubPageClient` dynamic panels list.
- Salvage likely:
  - `ReceivablesTab` selection/edit grid ideas, saved-view handling, line-item detail panel.
  - `EditableFinanceGrid` grouping/virtualization/editing patterns.

3) **Difficulty points for Stage 3 design decisions**
- **Rolled-up identical-row grouping**: no exact current implementation; requires new grouping key logic at line-item/record level.
- **Billed-at-bottom**: current sorting is by month/client/campaign and status display only; new sort partition likely needed.
- **Batch mark billed**: no existing finance receivables batch action wiring; closest reusable pattern is pacing mappings selection bar.

4) **Route/guard considerations**
- Finance currently lacks dedicated `app/finance/layout.tsx` with `AdminGuard`; if Stage 1 D7 requires strict admin gating for `/finance/receivables`, adding route-level guard needs explicit design decision (client guard vs server gate/redirect).

