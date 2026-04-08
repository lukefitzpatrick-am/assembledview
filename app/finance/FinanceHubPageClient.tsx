"use client"

import dynamic from "next/dynamic"
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ToastAction } from "@/components/ui/toast"
import { saveAs } from "file-saver"
import { usePathname } from "next/navigation"
import { Bookmark, ChevronDown, Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { FinanceFilterToolbar } from "@/components/finance/FinanceFilterToolbar"
import { FinanceOverviewHero, FinanceOverviewProvider } from "@/components/finance/tabs/OverviewTab"
import { toast } from "@/components/ui/use-toast"
import type { BillingRecord, FinanceFilters } from "@/lib/types/financeBilling"
import { fetchFinanceBillingForMonths, type FinanceBillingQuery } from "@/lib/finance/api"
import { getCurrentAndNextBillingMonths } from "@/lib/finance/utils"
import { clientAccentColour, clientInitials } from "@/lib/finance/cardHelpers"
import { expandMonthRange } from "@/lib/finance/monthRange"
import { formatLineItemDescription } from "@/lib/finance/lineItemDescription"
import { cn } from "@/lib/utils"
import { formatMoney } from "@/lib/utils/money"
import { buildFinanceHubWorkbook } from "@/lib/finance/excelFinanceExport"
import { exportBillingRecordsCsv, exportPayablesDetailCsv } from "@/lib/finance/export"
import { exportAccrualWorkbook } from "@/lib/finance/accrualExcel"
import { fetchFinanceEditsList } from "@/lib/finance/api"
import { computeAccrualByClient, parseAccrualReconcilesFromEdits } from "@/lib/finance/computeAccrual"
import {
  buildFinanceForecastWorkbook,
  financeForecastExportFilenameStem,
} from "@/lib/finance/forecast/exportFinanceForecast"
import type { FinanceForecastDataset } from "@/lib/types/financeForecast"
import {
  exportFlatBillingWorkbook,
  exportPayablesWorkbook,
  exportReceivablesWorkbook,
} from "@/lib/finance/exportFinanceHub"
import {
  parseFinanceHubTabParam,
  scheduleFinanceFetchAll,
  useFinanceStore,
  type FinanceHubFetchError,
  type FinanceHubTab,
} from "@/lib/finance/useFinanceStore"

const financeHubEffectDepPrev = new Map<string, unknown[]>()

/** Set `NEXT_PUBLIC_FINANCE_DEBUG=1` to log which effect deps changed between runs (console). */
function logFinanceHubEffectDepChanges(label: string, names: readonly string[], values: readonly unknown[]) {
  const prev = financeHubEffectDepPrev.get(label)
  financeHubEffectDepPrev.set(label, [...values])
  if (process.env.NEXT_PUBLIC_FINANCE_DEBUG !== "1" || prev === undefined) return
  if (prev.length !== names.length || values.length !== names.length) return
  for (let i = 0; i < names.length; i++) {
    if (!Object.is(prev[i], values[i])) {
      console.info(`[finance-hub:${label}] dep "${names[i]}" changed`, { from: prev[i], to: values[i] })
    }
  }
}

const SAVED_VIEWS_KEY = "finance-hub-saved-views-v3"

type HubSavedView = {
  name: string
  filters: FinanceFilters
}

function HubPanelFallback() {
  return (
    <div className="animate-pulse rounded-lg border border-border/60 bg-muted/30 p-8">
      <div className="h-6 w-40 rounded bg-muted" />
      <div className="mt-4 h-4 w-full max-w-md rounded bg-muted" />
    </div>
  )
}

const FinanceOverviewPanel = dynamic(
  () => import("@/components/finance/hub/panels/FinanceOverviewPanel"),
  { loading: () => <HubPanelFallback /> }
)
const FinancePayablesPanel = dynamic(
  () => import("@/components/finance/hub/panels/FinancePayablesPanel"),
  { loading: () => <HubPanelFallback /> }
)
const FinanceAccrualPanel = dynamic(
  () => import("@/components/finance/hub/panels/FinanceAccrualPanel"),
  { loading: () => <HubPanelFallback /> }
)
const FinanceForecastPanel = dynamic(
  () => import("@/components/finance/hub/panels/FinanceForecastPanel"),
  { loading: () => <HubPanelFallback /> }
)

function readSavedViews(): HubSavedView[] {
  try {
    const raw = localStorage.getItem(SAVED_VIEWS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as HubSavedView[]) : []
  } catch {
    return []
  }
}

function writeSavedViews(views: HubSavedView[]) {
  localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(views))
}

function australianFyStartYearForDate(d: Date): number {
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  return m >= 7 ? y : y - 1
}

const RECEIVABLE_BILLING_TYPES = new Set<BillingRecord["billing_type"]>(["media", "sow", "retainer"])

function isReceivableRecord(r: BillingRecord): boolean {
  return RECEIVABLE_BILLING_TYPES.has(r.billing_type)
}

/** Hub UI: fee / ad serving blocks use billing_type `sow` — show as "Fees", not "SOW". */
function receivableRecordSectionLabel(billingType: BillingRecord["billing_type"]): string {
  if (billingType === "sow") return "Fees"
  if (billingType === "media") return "Media"
  if (billingType === "retainer") return "Retainer"
  return billingType
}

/** Matches `ReceivablesTab` badge colours (media → blue, sow → violet, retainer → green). */
function billingTypeBadgeClass(type: BillingRecord["billing_type"]) {
  if (type === "media") return "bg-blue-500/15 text-blue-700 dark:text-blue-300"
  if (type === "sow") return "bg-violet-500/15 text-violet-700 dark:text-violet-300"
  return "bg-green-500/15 text-green-700 dark:text-green-300"
}

type MediaPlanGroup = {
  mbaNumber: string
  campaignName: string
  records: BillingRecord[]
  total: number
}

type ClientGroup = {
  clientsId: number
  clientName: string
  mediaPlans: MediaPlanGroup[]
  total: number
}

type MonthGroup = {
  monthIso: string
  monthLabel: string
  clients: ClientGroup[]
  total: number
}

function useFinanceHubReceivablesData(activeTab: FinanceHubTab): { loading: boolean; visibleMonthGroups: MonthGroup[] } {
  const filters = useFinanceStore((s) => s.filters)
  const [records, setRecords] = useState<BillingRecord[]>([])
  const [loading, setLoading] = useState(true)

  const [currentMonth, nextMonth] = useMemo(() => getCurrentAndNextBillingMonths(), [])

  const clientsKey = useMemo(() => filters.selectedClients.join(","), [filters.selectedClients])
  const publishersKey = useMemo(() => filters.selectedPublishers.join(","), [filters.selectedPublishers])
  const billingTypesKey = useMemo(
    () => [...filters.billingTypes].sort().join(","),
    [filters.billingTypes]
  )
  const statusesKey = useMemo(() => [...filters.statuses].sort().join(","), [filters.statuses])

  useEffect(() => {
    logFinanceHubEffectDepChanges(
      "receivables-billing-fetch",
      [
        "activeTab",
        "currentMonth",
        "nextMonth",
        "includeDrafts",
        "clientsKey",
        "publishersKey",
        "searchQuery",
        "billingTypesKey",
        "statusesKey",
      ],
      [
        activeTab,
        currentMonth,
        nextMonth,
        filters.includeDrafts,
        clientsKey,
        publishersKey,
        filters.searchQuery,
        billingTypesKey,
        statusesKey,
      ]
    )

    if (activeTab !== "billing") {
      setRecords((prev) => (prev.length === 0 ? prev : []))
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
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

    void fetchFinanceBillingForMonths([currentMonth, nextMonth], params)
      .then((rows) => {
        if (cancelled) return
        setRecords(rows.filter((r) => isReceivableRecord(r)))
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [
    activeTab,
    currentMonth,
    nextMonth,
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
          total: 0,
        })
      }
      const cg = clientsMap.get(r.clients_id)!
      const mbaKey = r.mba_number ?? ""
      let mp = cg.mediaPlans.find((m) => m.mbaNumber === mbaKey)
      if (!mp) {
        mp = {
          mbaNumber: mbaKey,
          campaignName: r.campaign_name || mbaKey || "Campaign",
          records: [],
          total: 0,
        }
        cg.mediaPlans.push(mp)
      }
      mp.records.push(r)
      mp.total += r.total
      cg.total += r.total
    }

    const out: MonthGroup[] = []
    for (const [monthIso, clientsMap] of byMonth.entries()) {
      const clients = [...clientsMap.values()].sort((a, b) =>
        a.clientName.localeCompare(b.clientName, undefined, { sensitivity: "base" })
      )
      for (const c of clients) {
        c.mediaPlans.sort((a, b) =>
          (a.campaignName || "").localeCompare(b.campaignName || "", undefined, { sensitivity: "base" })
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

  return { loading, visibleMonthGroups }
}

/** Receivables list: current + next month, grouped month → client → media plan (matches client hub billing card patterns). */
function FinanceHubReceivablesSection({
  visibleMonthGroups,
  loading,
}: {
  visibleMonthGroups: MonthGroup[]
  loading: boolean
}) {
  const emptyCopy = (
    <p className="py-10 text-sm text-muted-foreground">
      No receivable billing rows for the current filters and billing months in view.
    </p>
  )

  return (
    <div className="relative">
      {loading ? (
        <div className="pointer-events-none absolute inset-x-0 -top-1 h-0.5 overflow-hidden">
          <div className="h-full w-1/3 animate-pulse bg-primary" />
        </div>
      ) : null}

      {loading && visibleMonthGroups.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Loading receivables…
        </div>
      ) : !loading && visibleMonthGroups.length === 0 ? (
        emptyCopy
      ) : (
        <div className="space-y-8 pt-1">
          {visibleMonthGroups.map((mg) => {
            const invoiceCount = mg.clients.reduce(
              (n, c) =>
                n + c.mediaPlans.reduce((m, mp) => m + mp.records.length, 0),
              0
            )
            const clientNoun = mg.clients.length === 1 ? "client" : "clients"
            const invoiceNoun = invoiceCount === 1 ? "invoice" : "invoices"

            return (
              <section key={mg.monthIso} className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-border/50 pb-2">
                  <p className="text-sm font-medium text-foreground">{mg.monthLabel}</p>
                  <div className="flex flex-wrap items-end justify-end gap-x-4">
                    <p className="text-xs text-muted-foreground">
                      {mg.clients.length} {clientNoun} · {invoiceCount} {invoiceNoun}
                    </p>
                    <p className="text-xs font-medium tabular-nums text-foreground">
                      {formatMoney(mg.total)}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {mg.clients.map((client) => {
                    const invCount = client.mediaPlans.reduce((n, mp) => n + mp.records.length, 0)
                    const invNoun = invCount === 1 ? "invoice" : "invoices"
                    const accent = clientAccentColour(client.clientsId)

                    return (
                      <Collapsible key={`${mg.monthIso}-${client.clientsId}`} defaultOpen className="group">
                        <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
                          <CollapsibleTrigger asChild>
                            <header className="flex w-full cursor-pointer items-center gap-3 border-b border-border/60 bg-muted/40 px-4 py-3 text-left transition-colors hover:bg-muted/55">
                              <Avatar className="h-9 w-9 rounded-full border border-border/40 shadow-sm">
                                <AvatarFallback
                                  className="text-xs font-semibold text-white"
                                  style={{ backgroundColor: accent }}
                                >
                                  {clientInitials(client.clientName)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{client.clientName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {invCount} {invNoun} · {mg.monthLabel}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                  Subtotal
                                </p>
                                <p className="text-base font-semibold tabular-nums">
                                  {formatMoney(client.total)}
                                </p>
                              </div>
                              <ChevronDown
                                className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=closed]:-rotate-90"
                                aria-hidden
                              />
                            </header>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="grid gap-3 p-4 lg:grid-cols-2">
                              {client.mediaPlans.flatMap((mp, mpIdx) =>
                                mp.records.map((rec, recIdx) => (
                                  <article
                                    key={`${mg.monthIso}-${client.clientsId}-${mp.mbaNumber}-${mpIdx}-${rec.billing_type}-${rec.id}-${recIdx}`}
                                    className="overflow-hidden rounded-md border border-border/60"
                                  >
                                    <div className="flex items-start justify-between gap-3 bg-muted/40 px-3 py-2.5">
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">{mp.campaignName}</p>
                                        {mp.mbaNumber ? (
                                          <p className="truncate text-[11px] tabular-nums text-muted-foreground">
                                            {mp.mbaNumber}
                                          </p>
                                        ) : null}
                                      </div>
                                      <div className="flex shrink-0 flex-col items-end gap-1">
                                        <Badge
                                          variant="secondary"
                                          className={cn(
                                            "text-[10px] font-semibold uppercase",
                                            billingTypeBadgeClass(rec.billing_type)
                                          )}
                                        >
                                          {receivableRecordSectionLabel(rec.billing_type)}
                                        </Badge>
                                        <p className="text-sm font-semibold tabular-nums">
                                          {formatMoney(rec.total)}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="px-3 py-1">
                                      {(rec.line_items ?? []).length === 0 ? (
                                        <p className="py-2 text-xs text-muted-foreground">No line items</p>
                                      ) : (
                                        [...(rec.line_items ?? [])]
                                          .sort((a, b) => a.sort_order - b.sort_order)
                                          .map((li, liIdx) => {
                                            const { primary, channelLabel } =
                                              formatLineItemDescription(li)
                                            return (
                                              <div
                                                key={`li-${liIdx}-${li.sort_order}-${li.item_code}-${li.line_type}`}
                                                className="flex items-start justify-between gap-3 border-b border-border/40 py-2 last:border-0"
                                              >
                                                <div className="min-w-0">
                                                  <p className="truncate text-xs text-foreground">
                                                    {primary}
                                                  </p>
                                                  <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                                    {channelLabel}
                                                  </p>
                                                </div>
                                                <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                                  {formatMoney(li.amount)}
                                                </p>
                                              </div>
                                            )
                                          })
                                      )}
                                    </div>
                                  </article>
                                ))
                              )}
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function financeErrorCopyBlock(err: FinanceHubFetchError): string {
  return [`Status: ${err.status ?? "unknown"}`, `URL: ${err.requestUrl ?? "unknown"}`, `Message: ${err.error}`].join(
    "\n"
  )
}

function buildSearchParams(activeTab: FinanceHubTab, filters: FinanceFilters) {
  const params = new URLSearchParams()
  params.set("tab", activeTab)
  params.set("from", filters.monthRange.from)
  params.set("to", filters.monthRange.to)
  if (filters.selectedClients.length) params.set("clients", filters.selectedClients.join(","))
  if (filters.selectedPublishers.length) params.set("publishers", filters.selectedPublishers.join(","))
  if (filters.searchQuery.trim()) params.set("q", filters.searchQuery.trim())
  params.set("drafts", filters.includeDrafts ? "1" : "0")
  return params
}

export default function FinanceHubPageClient() {
  const pathname = usePathname()
  const lastWrittenQs = useRef<string>("")
  const initialSearchParamsRef = useRef<URLSearchParams | null>(null)
  const didInitFromUrl = useRef(false)
  const activeTab = useFinanceStore((s) => s.activeTab)
  const filters = useFinanceStore((s) => s.filters)
  const monthFromKey = filters.monthRange.from
  const monthToKey = filters.monthRange.to
  const clientsCsvKey = filters.selectedClients.join(",")
  const publishersCsvKey = filters.selectedPublishers.join(",")
  const searchQueryKey = filters.searchQuery
  const includeDraftsKey = filters.includeDrafts ? "1" : "0"
  const hubFetchClientsKey = useMemo(() => filters.selectedClients.join(","), [filters.selectedClients])
  const hubFetchPublishersKey = useMemo(() => filters.selectedPublishers.join(","), [filters.selectedPublishers])
  const hubFetchBillingTypesKey = useMemo(
    () => [...filters.billingTypes].sort().join(","),
    [filters.billingTypes]
  )
  const hubFetchStatusesKey = useMemo(() => [...filters.statuses].sort().join(","), [filters.statuses])
  const { loading: hubReceivablesLoading, visibleMonthGroups } = useFinanceHubReceivablesData(activeTab)
  const [financeReportDownloading, setFinanceReportDownloading] = useState(false)
  const setFilters = useFinanceStore((s) => s.setFilters)
  const setActiveTab = useFinanceStore((s) => s.setActiveTab)
  const billingRecords = useFinanceStore((s) => s.billingRecords)
  const payablesRecords = useFinanceStore((s) => s.payablesRecords)
  const billingLoading = useFinanceStore((s) => s.billingLoading)
  const billingError = useFinanceStore((s) => s.billingError)
  const payablesError = useFinanceStore((s) => s.payablesError)

  const [savedViewNames, setSavedViewNames] = useState<string[]>(() =>
    readSavedViews().map((v) => v.name)
  )

  const savedViewsList = useMemo(() => readSavedViews(), [savedViewNames])

  useEffect(() => {
    void scheduleFinanceFetchAll()
  }, [])

  useEffect(() => {
    logFinanceHubEffectDepChanges(
      "scheduleFinanceFetchAll",
      [
        "monthFrom",
        "monthTo",
        "includeDrafts",
        "hubFetchClientsKey",
        "hubFetchPublishersKey",
        "hubFetchBillingTypesKey",
        "hubFetchStatusesKey",
        "searchQuery",
      ],
      [
        filters.monthRange.from,
        filters.monthRange.to,
        filters.includeDrafts,
        hubFetchClientsKey,
        hubFetchPublishersKey,
        hubFetchBillingTypesKey,
        hubFetchStatusesKey,
        filters.searchQuery,
      ]
    )
    if (process.env.NEXT_PUBLIC_FINANCE_DEBUG === "1") {
      console.log("[finance-hub] scheduleFinanceFetchAll effect fired", {
        monthFrom: filters.monthRange.from,
        monthTo: filters.monthRange.to,
        includeDrafts: filters.includeDrafts,
        hubFetchClientsKey,
        hubFetchPublishersKey,
        hubFetchBillingTypesKey,
        hubFetchStatusesKey,
        searchQuery: filters.searchQuery,
      })
    }
    void scheduleFinanceFetchAll()
  }, [
    filters.monthRange.from,
    filters.monthRange.to,
    filters.includeDrafts,
    hubFetchClientsKey,
    hubFetchPublishersKey,
    hubFetchBillingTypesKey,
    hubFetchStatusesKey,
    filters.searchQuery,
  ])

  useEffect(() => {
    if (didInitFromUrl.current) return
    didInitFromUrl.current = true
    if (initialSearchParamsRef.current === null) {
      initialSearchParamsRef.current = new URLSearchParams(window.location.search)
    }
    const sp = initialSearchParamsRef.current

    const { activeTab: curTab, filters: cur, setActiveTab: applyTab, setFilters: applyFilters } =
      useFinanceStore.getState()

    const tabParam = parseFinanceHubTabParam(sp.get("tab"))
    if (tabParam !== curTab) applyTab(tabParam)

    const partial: Partial<FinanceFilters> = {}
    const from = sp.get("from")
    const to = sp.get("to")
    if (from) {
      const nextTo = to || from
      if (cur.monthRange.from !== from || cur.monthRange.to !== nextTo) {
        partial.monthRange = { from, to: nextTo }
      }
    }
    const nextClients = sp.has("clients") ? (sp.get("clients") || "").split(",").filter(Boolean) : []
    if (nextClients.join(",") !== cur.selectedClients.join(",")) partial.selectedClients = nextClients

    const nextPublishers = sp.has("publishers")
      ? (sp.get("publishers") || "")
          .split(",")
          .map(Number)
          .filter((n) => Number.isFinite(n))
      : []
    if (nextPublishers.join(",") !== cur.selectedPublishers.join(",")) {
      partial.selectedPublishers = nextPublishers
    }

    const nextQ = sp.get("q") || ""
    if (nextQ !== cur.searchQuery) partial.searchQuery = nextQ

    // Only sync drafts from URL when present — missing param keeps store default (excludes drafts).
    if (sp.has("drafts")) {
      const nextIncludeDrafts = sp.get("drafts") !== "0"
      if (nextIncludeDrafts !== cur.includeDrafts) partial.includeDrafts = nextIncludeDrafts
    }
    if (Object.keys(partial).length) applyFilters(partial)
  }, [])

  useEffect(() => {
    const params = buildSearchParams(activeTab, useFinanceStore.getState().filters)
    const qs = params.toString()
    if (qs === lastWrittenQs.current) return
    lastWrittenQs.current = qs
    const newUrl = `${pathname}?${qs}`
    window.history.replaceState(null, "", newUrl)
  }, [
    activeTab,
    monthFromKey,
    monthToKey,
    clientsCsvKey,
    publishersCsvKey,
    searchQueryKey,
    includeDraftsKey,
    pathname,
  ])

  useEffect(() => {
    if (!billingError) return
    const copyPayload = financeErrorCopyBlock(billingError)
    toast({
      variant: "destructive",
      title: "Billing data",
      description: billingError.error,
      action: (
        <ToastAction
          altText="Copy error details"
          onClick={() => {
            void navigator.clipboard.writeText(copyPayload)
          }}
        >
          Copy details
        </ToastAction>
      ),
    })
  }, [billingError])

  useEffect(() => {
    if (!payablesError) return
    const copyPayload = financeErrorCopyBlock(payablesError)
    toast({
      variant: "destructive",
      title: "Payables data",
      description: payablesError.error,
      action: (
        <ToastAction
          altText="Copy error details"
          onClick={() => {
            void navigator.clipboard.writeText(copyPayload)
          }}
        >
          Copy details
        </ToastAction>
      ),
    })
  }, [payablesError])

  const saveCurrentView = useCallback(() => {
    const name = window.prompt("Name this saved view")
    if (!name || !name.trim()) return
    const snap = useFinanceStore.getState().filters
    const next: HubSavedView = { name: name.trim(), filters: { ...snap } }
    const prev = readSavedViews().filter((v) => v.name !== next.name)
    const merged = [next, ...prev]
    writeSavedViews(merged)
    setSavedViewNames(merged.map((v) => v.name))
    toast({ title: "Saved", description: `View “${next.name}” stored in this browser.` })
  }, [])

  const loadSavedView = useCallback((name: string) => {
    const views = readSavedViews()
    const view = views.find((v) => v.name === name)
    if (!view) return
    setFilters(view.filters)
  }, [setFilters])

  const monthLabel = useMemo(
    () =>
      filters.monthRange.from === filters.monthRange.to
        ? filters.monthRange.from
        : `${filters.monthRange.from}_${filters.monthRange.to}`,
    [filters.monthRange.from, filters.monthRange.to]
  )

  const receivableRecords = useMemo(
    () => billingRecords.filter((r) => isReceivableRecord(r)),
    [billingRecords]
  )

  const flatListRecords = useMemo(
    () => (activeTab === "payables" ? payablesRecords : billingRecords),
    [activeTab, billingRecords, payablesRecords]
  )

  const exportPrimaryExcel = useCallback(async () => {
    try {
      if (activeTab === "payables") {
        await exportPayablesWorkbook(payablesRecords, monthLabel, "Finance_hub_payables")
      } else if (activeTab === "accrual") {
        const edits = await fetchFinanceEditsList()
        const reconcileMap = parseAccrualReconcilesFromEdits(edits)
        const receivables = billingRecords.filter((r) => isReceivableRecord(r))
        let rows = computeAccrualByClient(receivables, payablesRecords, filters.monthRange, reconcileMap)
        if (filters.selectedClients.length > 0) {
          const want = new Set(filters.selectedClients.map(String))
          rows = rows.filter((r) => want.has(String(r.clients_id)))
        }
        const q = filters.searchQuery.trim().toLowerCase()
        if (q) {
          rows = rows.filter(
            (r) => r.client_name.toLowerCase().includes(q) || r.month.toLowerCase().includes(q)
          )
        }
        const stem =
          filters.monthRange.from === filters.monthRange.to
            ? `Accrual_${filters.monthRange.from}`
            : `Accrual_${filters.monthRange.from}_${filters.monthRange.to}`
        await exportAccrualWorkbook(rows, `${stem}.xlsx`)
      } else if (activeTab === "forecast") {
        const fyStart = australianFyStartYearForDate(new Date())
        const res = await fetch(`/api/finance/forecast?fy=${fyStart}&scenario=confirmed`, {
          cache: "no-store",
        })
        if (!res.ok) {
          throw new Error(res.status === 401 || res.status === 403 ? "Forecast unavailable" : "Forecast load failed")
        }
        const body = (await res.json()) as { dataset?: FinanceForecastDataset }
        const dataset = body.dataset
        if (!dataset) throw new Error("Forecast dataset missing")
        const workbook = await buildFinanceForecastWorkbook(
          dataset,
          { clientFilter: "", searchVersions: "", includeRowDebug: false },
          null
        )
        const buffer = await workbook.xlsx.writeBuffer()
        const blob = new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        })
        saveAs(blob, `${financeForecastExportFilenameStem(dataset)}.xlsx`)
      } else {
        await exportReceivablesWorkbook(receivableRecords, monthLabel, "Finance_hub_receivables")
      }
      toast({ title: "Export ready", description: "Download should start shortly." })
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Export failed",
        description: e instanceof Error ? e.message : "Unknown error",
      })
    }
  }, [
    activeTab,
    billingRecords,
    filters.monthRange,
    filters.searchQuery,
    filters.selectedClients,
    monthLabel,
    payablesRecords,
    receivableRecords,
  ])

  const exportFlatCsv = useCallback(() => {
    const stem =
      activeTab === "payables" ? "Finance_hub_payables_flat" : "Finance_hub_billing_flat"
    const name = `${stem}_${monthLabel.replace(/\s+/g, "_")}.csv`
    if (activeTab === "payables") {
      exportPayablesDetailCsv(flatListRecords, name)
    } else {
      exportBillingRecordsCsv(flatListRecords, name)
    }
  }, [activeTab, flatListRecords, monthLabel])

  const exportFlatXlsx = useCallback(async () => {
    try {
      const stem =
        activeTab === "payables" ? "Finance_hub_payables_flat" : "Finance_hub_billing_flat"
      await exportFlatBillingWorkbook(
        flatListRecords,
        `${stem}_${monthLabel.replace(/\s+/g, "_")}.xlsx`
      )
      toast({ title: "Export ready", description: "Flat list workbook downloaded." })
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Export failed",
        description: e instanceof Error ? e.message : "Unknown error",
      })
    }
  }, [activeTab, flatListRecords, monthLabel])

  const handleDownloadFinanceReport = useCallback(async () => {
    try {
      setFinanceReportDownloading(true)
      const flattened = visibleMonthGroups.map((mg) => ({
        monthIso: mg.monthIso,
        monthLabel: mg.monthLabel,
        records: mg.clients.flatMap((c) => c.mediaPlans.flatMap((mp) => mp.records)),
      }))
      const buffer = await buildFinanceHubWorkbook(flattened)
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      const today = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `Finance_Hub_${today}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast({ title: "Export ready", description: "Finance report downloaded." })
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Export failed",
        description: e instanceof Error ? e.message : "Unknown error",
      })
    } finally {
      setFinanceReportDownloading(false)
    }
  }, [visibleMonthGroups])

  const financeReportExportDisabled =
    activeTab !== "billing" ||
    hubReceivablesLoading ||
    visibleMonthGroups.length === 0 ||
    financeReportDownloading

  const onTabChange = (value: string) => {
    setActiveTab(value)
  }

  return (
    <FinanceOverviewProvider>
      <div className="w-full max-w-none px-4 pb-10 pt-4 md:px-6 md:pt-6">
        <FinanceOverviewHero />

        <Tabs value={activeTab} onValueChange={onTabChange}>
          <div className="mt-4 flex items-end justify-between gap-3 border-b border-border/50">
            <TabsList className="h-auto gap-1 bg-transparent p-0">
              <TabsTrigger
                value="overview"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="billing"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Receivables
              </TabsTrigger>
              <TabsTrigger
                value="payables"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Payables
              </TabsTrigger>
              <TabsTrigger
                value="accrual"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Accrual
              </TabsTrigger>
              <TabsTrigger
                value="forecast"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Forecast
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2 pb-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Bookmark className="mr-2 h-4 w-4" />
                    Saved views
                    <ChevronDown className="ml-1 h-4 w-4 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={saveCurrentView}>Save current filters…</DropdownMenuItem>
                  {savedViewsList.length === 0 ? (
                    <DropdownMenuItem disabled>No saved views yet</DropdownMenuItem>
                  ) : (
                    savedViewsList.map((v) => (
                      <DropdownMenuItem key={v.name} onClick={() => loadSavedView(v.name)}>
                        {v.name}
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Download className="mr-2 h-4 w-4" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[14rem]">
                  <DropdownMenuItem
                    disabled={financeReportExportDisabled}
                    onClick={() => void handleDownloadFinanceReport()}
                  >
                    Download Finance Report
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => void exportPrimaryExcel()}>Export to Excel</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={exportFlatCsv}>Flat list (CSV)</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void exportFlatXlsx()}>Flat list (XLSX)</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="mt-3 rounded-md border border-border/60 bg-card px-3 py-2">
            <FinanceFilterToolbar />
          </div>

          {billingLoading ? (
            <div className="mt-2 h-0.5 w-full animate-pulse bg-primary/50" aria-live="polite" />
          ) : null}

          <div className="mt-4">
            <TabsContent value="overview" className="mt-0">
              <Suspense fallback={<HubPanelFallback />}>
                <FinanceOverviewPanel />
              </Suspense>
            </TabsContent>
            <TabsContent value="billing" className="mt-0">
              <FinanceHubReceivablesSection
                loading={hubReceivablesLoading}
                visibleMonthGroups={visibleMonthGroups}
              />
            </TabsContent>
            <TabsContent value="payables" className="mt-0">
              <Suspense fallback={<HubPanelFallback />}>
                <FinancePayablesPanel />
              </Suspense>
            </TabsContent>
            <TabsContent value="accrual" className="mt-0">
              <Suspense fallback={<HubPanelFallback />}>
                <FinanceAccrualPanel />
              </Suspense>
            </TabsContent>
            <TabsContent value="forecast" className="mt-0">
              <Suspense fallback={<HubPanelFallback />}>
                <FinanceForecastPanel />
              </Suspense>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </FinanceOverviewProvider>
  )
}
