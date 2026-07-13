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
import { FinanceFilterToolbar } from "@/components/finance/FinanceFilterToolbar"
import { FinanceOverviewHero, FinanceOverviewProvider } from "@/components/finance/hub/panels/FinanceOverviewPanel"
import {
  ReceivablesPageClient,
  type ReceivablesHubBridge,
} from "@/app/finance/receivables/ReceivablesPageClient"
import { toast } from "@/components/ui/use-toast"
import type { FinanceFilters } from "@/lib/types/financeBilling"
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
import { isReceivableRecord } from "@/lib/finance/useReceivablesData"
import {
  parseFinanceHubTabParam,
  scheduleFinanceFetchAll,
  useFinanceStore,
  type FinanceHubFetchError,
  type FinanceHubTab,
} from "@/lib/finance/useFinanceStore"
import {
  fyDisplayLabel,
  fyMonthRange,
  fySelectOptions,
} from "@/lib/finance/months"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

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
    <div className="animate-pulse rounded-card border border-border bg-surface-panel p-8 shadow-e1">
      <div className="h-6 w-40 rounded-input bg-card" />
      <div className="mt-4 h-4 w-full max-w-md rounded-input bg-card" />
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
const FinanceReportPanel = dynamic(
  () => import("@/components/finance/hub/panels/FinanceReportPanel"),
  { loading: () => <HubPanelFallback /> }
)
const FinanceXeroQueuePanel = dynamic(
  () => import("@/components/finance/hub/panels/FinanceXeroQueuePanel"),
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

function financeErrorCopyBlock(err: FinanceHubFetchError): string {
  return [`Status: ${err.status ?? "unknown"}`, `URL: ${err.requestUrl ?? "unknown"}`, `Message: ${err.error}`].join(
    "\n"
  )
}

function buildSearchParams(activeTab: FinanceHubTab, filters: FinanceFilters) {
  const params = new URLSearchParams()
  params.set("tab", activeTab)
  params.set("fy", String(filters.financialYear))
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
  const financialYearKey = filters.financialYear
  const clientsCsvKey = filters.selectedClients.join(",")
  const publishersCsvKey = filters.selectedPublishers.join(",")
  const searchQueryKey = filters.searchQuery
  const includeDraftsKey = filters.includeDrafts ? "1" : "0"
  const fyOptions = useMemo(() => fySelectOptions(), [])
  const hubFetchClientsKey = useMemo(() => filters.selectedClients.join(","), [filters.selectedClients])
  const hubFetchPublishersKey = useMemo(() => filters.selectedPublishers.join(","), [filters.selectedPublishers])
  const hubFetchBillingTypesKey = useMemo(
    () => [...filters.billingTypes].sort().join(","),
    [filters.billingTypes]
  )
  const hubFetchStatusesKey = useMemo(() => [...filters.statuses].sort().join(","), [filters.statuses])
  const [receivablesBridge, setReceivablesBridge] = useState<ReceivablesHubBridge>({
    synced: false,
    loading: false,
    bump: () => {},
    visibleMonthGroups: [],
  })
  const handleReceivablesHubBridge = useCallback((bridge: ReceivablesHubBridge) => {
    setReceivablesBridge(bridge)
  }, [])
  const visibleMonthGroups = receivablesBridge.visibleMonthGroups
  const hubReceivablesLoading = receivablesBridge.loading
  const hubReceivablesSynced = receivablesBridge.synced
  const bumpReceivablesFetch = receivablesBridge.bump
  const [financeReportDownloading, setFinanceReportDownloading] = useState(false)
  const setFilters = useFinanceStore((s) => s.setFilters)
  const setActiveTab = useFinanceStore((s) => s.setActiveTab)
  const billingRecords = useFinanceStore((s) => s.billingRecords)
  const payablesRecords = useFinanceStore((s) => s.payablesRecords)
  const billingLoading = useFinanceStore((s) => s.billingLoading)
  const billingError = useFinanceStore((s) => s.billingError)
  const payablesError = useFinanceStore((s) => s.payablesError)

  const applyFinancialYear = useCallback(
    (fy: number) => {
      setFilters({
        financialYear: fy,
        monthRange: fyMonthRange(fy),
      })
    },
    [setFilters]
  )

  const [savedViewNames, setSavedViewNames] = useState<string[]>(() =>
    readSavedViews().map((v) => v.name)
  )

  // savedViewNames bumps when user saves/deletes a view so we re-read localStorage
  const savedViewsList = useMemo(() => readSavedViews(), [savedViewNames]) // eslint-disable-line react-hooks/exhaustive-deps -- intentional invalidation key

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hubFetchClientsKey, hubFetchPublishersKey, hubFetchBillingTypesKey, and hubFetchStatusesKey are stable string equivalents of filters.selectedClients, filters.selectedPublishers, filters.billingTypes, and filters.statuses
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
    const fyRaw = sp.get("fy")
    if (fyRaw) {
      const fy = Number.parseInt(fyRaw, 10)
      if (Number.isFinite(fy) && fy >= 2000 && fy <= 2100 && fy !== cur.financialYear) {
        partial.financialYear = fy
        // Deep-link FY also scopes the month toolbar to that FY unless from/to override.
        if (!sp.get("from")) {
          partial.monthRange = fyMonthRange(fy)
        }
      }
    }
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

    // Only sync drafts from URL when present â€” missing param keeps store default (excludes drafts).
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
    financialYearKey,
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
    toast({ title: "Saved", description: `View â€œ${next.name}â€ stored in this browser.` })
  }, [])

  const loadSavedView = useCallback((name: string) => {
    const views = readSavedViews()
    const view = views.find((v) => v.name === name)
    if (!view) return
    const f = view.filters
    const fy =
      typeof f.financialYear === "number" && Number.isFinite(f.financialYear)
        ? f.financialYear
        : useFinanceStore.getState().filters.financialYear
    setFilters({
      ...f,
      financialYear: fy,
      monthRange: f.monthRange ?? fyMonthRange(fy),
    })
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
        const fyStart = useFinanceStore.getState().filters.financialYear
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
    filters.financialYear,
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
        records: mg.clients.flatMap((c) => [
          ...c.mediaPlans.flatMap((mp) => mp.records),
          ...c.scopeOfWorks.flatMap((mp) => mp.records),
          ...c.retainers,
        ]),
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
                Client Billing
              </TabsTrigger>
              <TabsTrigger
                value="payables"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Publisher Invoices
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
              <TabsTrigger
                value="report"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Report
              </TabsTrigger>
              <TabsTrigger
                value="queue"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Xero Queue
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2 pb-2">
              <div className="flex items-center gap-2">
                <span className="hidden text-xs font-medium text-muted-foreground sm:inline">FY</span>
                <Select
                  value={String(filters.financialYear)}
                  onValueChange={(v) => applyFinancialYear(Number.parseInt(v, 10))}
                >
                  <SelectTrigger className="h-9 w-[8.5rem]" aria-label="Financial year">
                    <SelectValue placeholder="Financial year" />
                  </SelectTrigger>
                  <SelectContent>
                    {fyOptions.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        FY {fyDisplayLabel(y)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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

          <div className="mt-3 rounded-card border border-border bg-card px-3 py-2 shadow-e1">
            <FinanceFilterToolbar
              receivables={
                activeTab === "billing"
                  ? {
                      synced: hubReceivablesSynced,
                      loading: hubReceivablesLoading,
                      bump: bumpReceivablesFetch,
                    }
                  : undefined
              }
            />
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
              <ReceivablesPageClient embedded onHubBridge={handleReceivablesHubBridge} />
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
            <TabsContent value="report" className="mt-0">
              <Suspense fallback={<HubPanelFallback />}>
                <FinanceReportPanel />
              </Suspense>
            </TabsContent>
            <TabsContent value="queue" className="mt-0">
              <Suspense fallback={<HubPanelFallback />}>
                <FinanceXeroQueuePanel />
              </Suspense>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </FinanceOverviewProvider>
  )
}

