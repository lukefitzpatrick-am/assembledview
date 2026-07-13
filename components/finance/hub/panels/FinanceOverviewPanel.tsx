"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { format } from "date-fns"
import { AlertTriangle, ArrowRight, BarChart3, CalendarRange, DollarSign, Scale, Wallet } from "lucide-react"
import { differenceInCalendarDays, parseISO } from "date-fns"
import { PAGE_HERO_PADDING, PageHeroShell, PageHeroTitleBlock } from "@/components/dashboard/PageHeroShell"
import {
  BaseChartCard,
  StackedBarChart,
  TreemapChart,
} from "@/components/charts/system"
import { reshapeSpendTreemap } from "@/components/dashboard/dashboardChartReshape"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { ErrorState, LoadingState } from "@/components/ui/states"
import type {
  BillingRecord,
  BillingStatus,
  BillingType,
  FinanceFilters,
} from "@/lib/types/financeBilling"
import {
  computeAccrualByClient,
  expandMonthRange,
  parseAccrualReconcilesFromEdits,
} from "@/lib/finance/computeAccrual"
import {
  fetchFinanceBillingForMonths,
  fetchFinanceEditsList,
  fetchFinancePayablesForMonths,
} from "@/lib/finance/api"
import { formatMoney } from "@/lib/format/money"
import { cn } from "@/lib/utils"
import { useFinanceStore, type FinanceHubTab } from "@/lib/finance/useFinanceStore"
import { setAssistantContext, clearAssistantContext } from "@/lib/assistantBridge"
import type { PageContext } from "@/lib/ava/types"
import { useAuthContext } from "@/contexts/AuthContext"
import {
  australianFyStartYearForDate,
  billingMonthsInAustralianFinancialYear,
  fyDisplayLabel,
  referenceDateForFyStartYear,
} from "@/lib/finance/months"
import { sumPayableRecordsAgencyExpected } from "@/lib/finance/aggregatePayablesPublisherGroups"

const RECEIVABLE_TYPES: BillingType[] = ["media", "sow", "retainer"]
const KPI_RECEIVABLE_STATUSES = new Set<BillingStatus>(["booked", "approved", "invoiced", "paid"])
const KPI_PAYABLE_STATUSES = new Set<BillingStatus>(["expected", "invoiced", "paid"])

const DEFAULT_HERO_BRAND = "var(--pacing-on-track)"
const chartCardQuiet = "border-0 bg-transparent shadow-e0"

function isReceivableRecord(r: BillingRecord): boolean {
  return RECEIVABLE_TYPES.includes(r.billing_type)
}

function normalizeClientFilterValue(value: string) {
  return value
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
}

function resolveClientProfileColour(
  displayName: string,
  clientColors: Record<string, string>
): string | undefined {
  if (!displayName || !clientColors || typeof clientColors !== "object") return undefined
  if (clientColors[displayName]) return clientColors[displayName]
  const trimmed = displayName.trim()
  if (trimmed !== displayName && clientColors[trimmed]) return clientColors[trimmed]
  const norm = normalizeClientFilterValue(displayName)
  if (!norm) return undefined
  for (const [key, colour] of Object.entries(clientColors)) {
    if (typeof colour !== "string" || !colour) continue
    if (normalizeClientFilterValue(key) === norm) return colour
  }
  return undefined
}

function buildTreemapFromMonthlyClient(
  monthly: Array<{ month: string; data: Array<{ client: string; amount: number }> }>
): Array<{ name: string; value: number; percentage: number }> {
  const totals: Record<string, number> = {}
  for (const m of monthly) {
    for (const row of m.data) {
      const name = row.client?.trim() || "—"
      totals[name] = (totals[name] || 0) + Number(row.amount) || 0
    }
  }
  const arr = Object.entries(totals)
    .map(([name, value]) => ({ name, value: Math.round(value), percentage: 0 }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value)
  const sum = arr.reduce((s, x) => s + x.value, 0)
  arr.forEach((x) => {
    x.percentage = sum > 0 ? (x.value / sum) * 100 : 0
  })
  return arr
}

function buildTreemapFromMonthlyPublisher(
  monthly: Array<{ month: string; data: Array<{ publisher: string; amount: number }> }>
): Array<{ name: string; value: number; percentage: number }> {
  const totals: Record<string, number> = {}
  for (const m of monthly) {
    for (const row of m.data) {
      const name = row.publisher?.trim() || "—"
      totals[name] = (totals[name] || 0) + Number(row.amount) || 0
    }
  }
  const arr = Object.entries(totals)
    .map(([name, value]) => ({ name, value: Math.round(value), percentage: 0 }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value)
  const sum = arr.reduce((s, x) => s + x.value, 0)
  arr.forEach((x) => {
    x.percentage = sum > 0 ? (x.value / sum) * 100 : 0
  })
  return arr
}

type AttentionItem = {
  id: string
  kind: "receivable_overdue" | "payable_dispute" | "accrual_large" | "draft_stale"
  title: string
  subtitle: string
  tab: FinanceHubTab
  filterPatch?: Partial<FinanceFilters>
}

type GlobalMonthlyClientRow = { month: string; data: Array<{ client: string; amount: number }> }
type GlobalMonthlyPublisherRow = { month: string; data: Array<{ publisher: string; amount: number }> }

type FinanceOverviewContextValue = {
  navigateWith: (tab: FinanceHubTab, patch?: Partial<FinanceFilters>) => void
  onAttentionClick: (item: AttentionItem) => void
  loading: boolean
  chartsLoading: boolean
  loadError: string | null
  fyStart: number
  currentMonth: string
  hubRangeLabel: string
  kpiTileClass: string
  kpiReceivablesThisMonth: number
  kpiReceivablesFytd: number
  kpiPayablesThisMonth: number
  kpiPayablesFytd: number
  kpiNetAccrualFytd: number
  fytdMonthRange: { from: string; to: string }
  fyClientBillingRows: Array<{
    clientsId: number
    clientName: string
    total: number
    brandColour?: string
  }>
  clientSpendData: Array<{ name: string; value: number; percentage: number }>
  publisherSpendData: Array<{ name: string; value: number; percentage: number }>
  dashboardClientTreemapColors: Record<string, string>
  dashboardMonthlyClientSeriesColors: Record<string, string>
  monthlyClientSpend: GlobalMonthlyClientRow[]
  monthlyPublisherSpend: GlobalMonthlyPublisherRow[]
  attentionItems: AttentionItem[]
}

const FinanceOverviewContext = createContext<FinanceOverviewContextValue | null>(null)

function useFinanceOverview() {
  const v = useContext(FinanceOverviewContext)
  if (!v) throw new Error("useFinanceOverview must be used within FinanceOverviewProvider")
  return v
}

export function FinanceOverviewProvider({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuthContext()
  const filters = useFinanceStore((s) => s.filters)
  const activeTab = useFinanceStore((s) => s.activeTab)
  const setFilters = useFinanceStore((s) => s.setFilters)
  const setActiveTab = useFinanceStore((s) => s.setActiveTab)
  const billingRecords = useFinanceStore((s) => s.billingRecords)
  const payablesRecords = useFinanceStore((s) => s.payablesRecords)
  const billingLoading = useFinanceStore((s) => s.billingLoading)
  const payablesLoading = useFinanceStore((s) => s.payablesLoading)
  const [editsList, setEditsList] = useState<unknown[]>([])
  const [monthlyPublisherSpend, setMonthlyPublisherSpend] = useState<GlobalMonthlyPublisherRow[]>([])
  const [monthlyClientSpend, setMonthlyClientSpend] = useState<GlobalMonthlyClientRow[]>([])
  const [clientProfileColors, setClientProfileColors] = useState<Record<string, string>>({})
  const [chartsLoading, setChartsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [scheduleFytd, setScheduleFytd] = useState({ billingYtd: 0, deliveryYtd: 0 })
  const [currentMonthBillingRecords, setCurrentMonthBillingRecords] = useState<BillingRecord[]>([])
  const [currentMonthPayablesRecords, setCurrentMonthPayablesRecords] = useState<BillingRecord[]>([])

  const currentMonth = format(new Date(), "yyyy-MM")
  const fyStart = filters.financialYear
  const currentFyStart = useMemo(() => australianFyStartYearForDate(new Date()), [])
  const fyMonthSet = useMemo(
    () => new Set(billingMonthsInAustralianFinancialYear(referenceDateForFyStartYear(fyStart))),
    [fyStart]
  )

  useEffect(() => {
    void (async () => {
      try {
        setEditsList(await fetchFinanceEditsList())
      } catch {
        setEditsList([])
      }
    })()
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/finance/hub-schedule-ytd?fy=${fyStart}`, { cache: "no-store" })
        if (!res.ok) return
        const body = (await res.json()) as {
          billingScheduleYtd?: number
          deliveryScheduleYtd?: number
        }
        if (cancelled) return
        setScheduleFytd({
          billingYtd: Math.round(Number(body.billingScheduleYtd ?? 0) * 100) / 100,
          deliveryYtd: Math.round(Number(body.deliveryScheduleYtd ?? 0) * 100) / 100,
        })
      } catch {
        if (!cancelled) setScheduleFytd({ billingYtd: 0, deliveryYtd: 0 })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fyStart])

  useEffect(() => {
    let cancelled = false
    const ac = new AbortController()
    setLoadError(null)
    void (async () => {
      try {
        const months = [currentMonth]
        const [billing, payables] = await Promise.all([
          fetchFinanceBillingForMonths(months, {}, ac.signal),
          fetchFinancePayablesForMonths(months, {}),
        ])
        if (cancelled) return
        setCurrentMonthBillingRecords(billing)
        setCurrentMonthPayablesRecords(payables)
      } catch (e) {
        if (
          (e instanceof DOMException && e.name === "AbortError") ||
          (e instanceof Error && e.name === "AbortError")
        ) {
          return
        }
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Failed to load overview data")
          setCurrentMonthBillingRecords([])
          setCurrentMonthPayablesRecords([])
        }
      }
    })()
    return () => {
      cancelled = true
      ac.abort()
    }
  }, [currentMonth])

  const reconcileMap = useMemo(() => parseAccrualReconcilesFromEdits(editsList), [editsList])

  const receivables = useMemo(
    () => billingRecords.filter((r) => isReceivableRecord(r)),
    [billingRecords]
  )

  const accrualRows = useMemo(
    () => computeAccrualByClient(receivables, payablesRecords, filters.monthRange, reconcileMap),
    [receivables, payablesRecords, filters.monthRange, reconcileMap]
  )

  const fyMonthsToDate = useMemo(() => {
    const months = billingMonthsInAustralianFinancialYear(referenceDateForFyStartYear(fyStart))
    if (fyStart < currentFyStart) return months
    if (fyStart > currentFyStart) return []
    return months.filter((m) => m <= currentMonth)
  }, [fyStart, currentFyStart, currentMonth])

  const fytdMonthRange = useMemo(() => {
    if (fyMonthsToDate.length === 0) {
      const months = billingMonthsInAustralianFinancialYear(referenceDateForFyStartYear(fyStart))
      if (months.length === 0) return { from: currentMonth, to: currentMonth }
      return { from: months[0]!, to: months[months.length - 1]! }
    }
    const from = fyMonthsToDate[0]!
    const to = fyMonthsToDate[fyMonthsToDate.length - 1]!
    return { from, to }
  }, [fyMonthsToDate, currentMonth, fyStart])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setChartsLoading(true)
      try {
        const [monthlyPubResp, monthlyClientResp] = await Promise.all([
          fetch("/api/dashboard/global-monthly-publisher-spend"),
          fetch("/api/dashboard/global-monthly-client-spend"),
        ])
        const monthlyPub = monthlyPubResp.ok ? await monthlyPubResp.json() : []
        const monthlyClient = monthlyClientResp.ok ? await monthlyClientResp.json() : null

        if (cancelled) return
        setMonthlyPublisherSpend(Array.isArray(monthlyPub) ? monthlyPub : [])
        setMonthlyClientSpend(
          monthlyClient && typeof monthlyClient === "object" && Array.isArray(monthlyClient.data)
            ? monthlyClient.data
            : []
        )
        const colours =
          monthlyClient &&
          typeof monthlyClient === "object" &&
          monthlyClient.clientColors &&
          typeof monthlyClient.clientColors === "object" &&
          !Array.isArray(monthlyClient.clientColors)
            ? (monthlyClient.clientColors as Record<string, string>)
            : {}
        setClientProfileColors(colours)
      } catch {
        if (!cancelled) {
          setMonthlyPublisherSpend([])
          setMonthlyClientSpend([])
          setClientProfileColors({})
        }
      } finally {
        if (!cancelled) setChartsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const accrualRowsFytd = useMemo(
    () => computeAccrualByClient(receivables, payablesRecords, fytdMonthRange, reconcileMap),
    [receivables, payablesRecords, fytdMonthRange, reconcileMap]
  )

  const kpiReceivablesThisMonth = useMemo(() => {
    let s = 0
    for (const r of currentMonthBillingRecords) {
      if (!isReceivableRecord(r)) continue
      if (r.billing_month !== currentMonth) continue
      if (!KPI_RECEIVABLE_STATUSES.has(r.status)) continue
      s += Number(r.total || 0)
    }
    return Math.round(s * 100) / 100
  }, [currentMonthBillingRecords, currentMonth])

  const kpiPayablesThisMonth = useMemo(
    () =>
      sumPayableRecordsAgencyExpected(
        currentMonthPayablesRecords,
        (r) =>
          r.billing_type === "payable" &&
          r.billing_month === currentMonth &&
          KPI_PAYABLE_STATUSES.has(r.status)
      ),
    [currentMonthPayablesRecords, currentMonth]
  )

  const kpiReceivablesFytd = scheduleFytd.billingYtd
  const kpiPayablesFytd = scheduleFytd.deliveryYtd

  const kpiNetAccrualFytd = useMemo(() => {
    let s = 0
    for (const row of accrualRowsFytd) s += row.accrual
    return Math.round(s * 100) / 100
  }, [accrualRowsFytd])

  const clientSpendData = useMemo(
    () => buildTreemapFromMonthlyClient(monthlyClientSpend),
    [monthlyClientSpend]
  )
  const publisherSpendData = useMemo(
    () => buildTreemapFromMonthlyPublisher(monthlyPublisherSpend),
    [monthlyPublisherSpend]
  )

  const dashboardClientTreemapColors = useMemo(() => {
    const out: Record<string, string> = {}
    for (const row of clientSpendData) {
      const c = resolveClientProfileColour(row.name, clientProfileColors)
      if (c) out[row.name] = c
    }
    return out
  }, [clientSpendData, clientProfileColors])

  const dashboardMonthlyClientSeriesColors = useMemo(() => {
    const names = new Set<string>()
    for (const m of monthlyClientSpend) {
      for (const item of m.data) {
        if (item.client) names.add(item.client)
      }
    }
    const out: Record<string, string> = {}
    for (const name of names) {
      const c = resolveClientProfileColour(name, clientProfileColors)
      if (c) out[name] = c
    }
    return out
  }, [monthlyClientSpend, clientProfileColors])

  const fyClientBillingRows = useMemo(() => {
    const byClient = new Map<
      number,
      { clientsId: number; clientName: string; total: number; brandColour?: string }
    >()
    for (const r of billingRecords) {
      if (!isReceivableRecord(r)) continue
      if (!fyMonthSet.has(r.billing_month)) continue
      if (!KPI_RECEIVABLE_STATUSES.has(r.status)) continue
      const prev = byClient.get(r.clients_id)
      const amt = Number(r.total || 0)
      const resolvedColour = resolveClientProfileColour(r.client_name || "", clientProfileColors)
      if (!prev) {
        byClient.set(r.clients_id, {
          clientsId: r.clients_id,
          clientName: r.client_name || "Unknown",
          total: amt,
          brandColour: resolvedColour,
        })
      } else {
        prev.total += amt
        if (!prev.brandColour && resolvedColour) prev.brandColour = resolvedColour
      }
    }
    return [...byClient.values()]
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [billingRecords, fyMonthSet, clientProfileColors])

  const attentionItems = useMemo((): AttentionItem[] => {
    const items: AttentionItem[] = []

    for (const r of billingRecords) {
      if (!isReceivableRecord(r)) continue
      if (r.status === "paid") continue
      const inv = r.invoice_date?.trim()
      if (!inv) continue
      try {
        const d = parseISO(inv.slice(0, 10))
        if (Number.isNaN(d.getTime())) continue
        if (differenceInCalendarDays(new Date(), d) <= 30) continue
      } catch {
        continue
      }
      items.push({
        id: `ro-${r.id}`,
        kind: "receivable_overdue",
        title: `Overdue receivable · ${r.client_name}`,
        subtitle: `${r.mba_number || "—"} · ${r.billing_month} · ${r.status} · invoice ${inv.slice(0, 10)}`,
        tab: "billing",
        filterPatch: {
          monthRange: { from: r.billing_month, to: r.billing_month },
          searchQuery: r.mba_number || r.campaign_name || r.client_name,
        },
      })
    }

    for (const r of payablesRecords) {
      if (r.billing_type !== "payable") continue
      if (r.status !== "disputed") continue
      items.push({
        id: `pd-${r.id}`,
        kind: "payable_dispute",
        title: `Payable in dispute · ${r.client_name}`,
        subtitle: `${r.mba_number || "—"} · ${r.billing_month}`,
        tab: "payables",
        filterPatch: {
          monthRange: { from: r.billing_month, to: r.billing_month },
          searchQuery: r.mba_number || r.campaign_name || "",
        },
      })
    }

    for (const row of accrualRows) {
      if (row.reconciled) continue
      if (Math.abs(row.accrual) <= 5000) continue
      items.push({
        id: `ac-${row.clients_id}-${row.month}`,
        kind: "accrual_large",
        title: `Large accrual · ${row.client_name}`,
        subtitle: `${row.month} · ${formatMoney(row.accrual)} · not reconciled`,
        tab: "accrual",
        filterPatch: {
          monthRange: { from: row.month, to: row.month },
          selectedClients: [String(row.clients_id)],
        },
      })
    }

    const now = new Date()
    for (const raw of editsList) {
      if (!raw || typeof raw !== "object") continue
      const e = raw as Record<string, unknown>
      const st = e.edit_status ?? e.editStatus
      if (st !== "draft") continue
      const created = String(e.created_at ?? e.createdAt ?? "")
      if (!created) continue
      try {
        const d = parseISO(created.slice(0, 10))
        if (Number.isNaN(d.getTime())) continue
        if (differenceInCalendarDays(now, d) <= 7) continue
      } catch {
        continue
      }
      const id = String(e.id ?? "")
      const fn = String(e.field_name ?? e.fieldName ?? "edit")
      items.push({
        id: `dr-${id || fn}`,
        kind: "draft_stale",
        title: "Stale draft finance edit",
        subtitle: `${fn} · created ${created.slice(0, 10)}`,
        tab: "billing",
        filterPatch: { includeDrafts: true },
      })
    }

    return items.slice(0, 50)
  }, [accrualRows, billingRecords, editsList, payablesRecords])

  const navigateWith = useCallback(
    (tab: FinanceHubTab, patch?: Partial<FinanceFilters>) => {
      if (patch) setFilters(patch)
      setActiveTab(tab)
    },
    [setActiveTab, setFilters]
  )

  const onAttentionClick = useCallback(
    (item: AttentionItem) => {
      navigateWith(item.tab, item.filterPatch)
    },
    [navigateWith]
  )

  const loading = billingLoading || payablesLoading

  const kpiTileClass =
    "group flex w-full flex-col rounded-card border border-border bg-card p-4 text-left shadow-e1 transition hover:bg-table-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

  const hubRangeMonths = expandMonthRange(filters.monthRange)
  const hubRangeLabel =
    hubRangeMonths.length === 0
      ? "—"
      : hubRangeMonths.length === 1
        ? hubRangeMonths[0]
        : `${hubRangeMonths[0]} → ${hubRangeMonths[hubRangeMonths.length - 1]}`

  const contextValue = useMemo(
    (): FinanceOverviewContextValue => ({
      navigateWith,
      onAttentionClick,
      loading,
      chartsLoading,
      loadError,
      fyStart,
      currentMonth,
      hubRangeLabel,
      kpiTileClass,
      kpiReceivablesThisMonth,
      kpiReceivablesFytd,
      kpiPayablesThisMonth,
      kpiPayablesFytd,
      kpiNetAccrualFytd,
      fytdMonthRange,
      fyClientBillingRows,
      clientSpendData,
      publisherSpendData,
      dashboardClientTreemapColors,
      dashboardMonthlyClientSeriesColors,
      monthlyClientSpend,
      monthlyPublisherSpend,
      attentionItems,
    }),
    [
      navigateWith,
      onAttentionClick,
      loading,
      chartsLoading,
      loadError,
      fyStart,
      currentMonth,
      hubRangeLabel,
      kpiTileClass,
      kpiReceivablesThisMonth,
      kpiReceivablesFytd,
      kpiPayablesThisMonth,
      kpiPayablesFytd,
      kpiNetAccrualFytd,
      fytdMonthRange,
      fyClientBillingRows,
      clientSpendData,
      publisherSpendData,
      dashboardClientTreemapColors,
      dashboardMonthlyClientSeriesColors,
      monthlyClientSpend,
      monthlyPublisherSpend,
      attentionItems,
    ]
  )

  const getPageContext = useCallback((): PageContext | undefined => {
    // Hard requirement: never emit finance aggregates for non-admin sessions.
    if (!isAdmin) return undefined

    return {
      route: { pathname: "/finance" },
      generatedAt: new Date().toISOString(),
      pageText: {
        title: "Finance Hub",
        breadcrumbs: ["Finance"],
      },
      state: {
        surface: "finance",
        activeTab,
        financialYear: filters.financialYear,
        monthRange: {
          from: filters.monthRange.from,
          to: filters.monthRange.to,
        },
        fyStart,
        currentMonth,
        hubRangeLabel,
        // Aggregate KPIs only — never row-level invoice/payable records.
        aggregates: {
          kpiReceivablesThisMonth,
          kpiReceivablesFytd,
          kpiPayablesThisMonth,
          kpiPayablesFytd,
          kpiNetAccrualFytd,
        },
      },
    }
  }, [
    activeTab,
    currentMonth,
    filters.financialYear,
    filters.monthRange.from,
    filters.monthRange.to,
    fyStart,
    hubRangeLabel,
    isAdmin,
    kpiNetAccrualFytd,
    kpiPayablesFytd,
    kpiPayablesThisMonth,
    kpiReceivablesFytd,
    kpiReceivablesThisMonth,
  ])

  useEffect(() => {
    const pageContext = getPageContext()
    if (!pageContext) {
      setAssistantContext({ pageContext: undefined })
      return
    }
    setAssistantContext({ pageContext })
  }, [getPageContext])

  useEffect(() => {
    return () => {
      clearAssistantContext()
    }
  }, [])

  return (
    <FinanceOverviewContext.Provider value={contextValue}>{children}</FinanceOverviewContext.Provider>
  )
}

export function FinanceOverviewHero() {
  const {
    navigateWith,
    fyStart,
    currentMonth,
    hubRangeLabel,
    kpiTileClass,
    kpiReceivablesThisMonth,
    kpiReceivablesFytd,
    kpiPayablesThisMonth,
    kpiPayablesFytd,
    kpiNetAccrualFytd,
    fytdMonthRange,
  } = useFinanceOverview()

  return (
    <div className="mb-2">
      <PageHeroShell brandColour={DEFAULT_HERO_BRAND}>
        <div className={cn("relative z-10", PAGE_HERO_PADDING)}>
          <div className="flex w-full flex-col gap-5 md:flex-row md:items-start md:gap-8">
            <div className="relative h-14 w-14 shrink-0">
              <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-pill border border-border shadow-e1">
                <span
                  className="flex h-full w-full items-center justify-center bg-pacing-on-track text-primary-foreground"
                  aria-hidden
                >
                  <DollarSign className="h-6 w-6" />
                </span>
              </div>
              <span
                className="absolute bottom-px right-px h-[10px] w-[10px] rounded-pill bg-accent shadow-e0"
                aria-hidden
              />
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <PageHeroTitleBlock
                title="Finance overview"
                titleAs="h2"
                brandColour={DEFAULT_HERO_BRAND}
                detail={
                  <>
                    <p className="font-medium text-status-ahead-fg">
                      FY{fyDisplayLabel(fyStart)} · Australian financial year
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-pill bg-pacing-on-track" aria-hidden />
                        Hub range: {hubRangeLabel}
                      </span>
                    </div>
                  </>
                }
              />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                <button
                  type="button"
                  className={kpiTileClass}
                  onClick={() =>
                    navigateWith("billing", {
                      monthRange: { from: currentMonth, to: currentMonth },
                      billingTypes: ["media", "sow", "retainer"],
                      statuses: ["booked", "approved", "invoiced", "paid"],
                    })
                  }
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Client Billing (this month)
                    </span>
                    <Wallet className="h-4 w-4 shrink-0 text-muted-foreground opacity-70 group-hover:opacity-100" />
                  </span>
                  <span className="num mt-2 text-2xl font-bold text-foreground">
                    {formatMoney(kpiReceivablesThisMonth)}
                  </span>
                  <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    {currentMonth} · booked+
                    <ArrowRight className="h-3 w-3" />
                  </span>
                </button>

                <button
                  type="button"
                  className={kpiTileClass}
                  onClick={() =>
                    navigateWith("billing", {
                      monthRange: { from: fytdMonthRange.from, to: fytdMonthRange.to },
                      billingTypes: ["media", "sow", "retainer"],
                      statuses: ["booked", "approved", "invoiced", "paid"],
                    })
                  }
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Client Billing (FY to date)
                    </span>
                    <CalendarRange className="h-4 w-4 shrink-0 text-muted-foreground opacity-70 group-hover:opacity-100" />
                  </span>
                  <span className="num mt-2 text-2xl font-bold text-foreground">
                    {formatMoney(kpiReceivablesFytd)}
                  </span>
                  <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    Billing schedule · FY{fyDisplayLabel(fyStart)} · through {currentMonth}
                    <ArrowRight className="h-3 w-3" />
                  </span>
                </button>

                <button
                  type="button"
                  className={kpiTileClass}
                  onClick={() =>
                    navigateWith("payables", {
                      monthRange: { from: currentMonth, to: currentMonth },
                      billingTypes: ["payable"],
                      statuses: ["expected", "invoiced", "paid"],
                    })
                  }
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Publisher Invoices (this month)
                    </span>
                    <BarChart3 className="h-4 w-4 shrink-0 text-muted-foreground opacity-70 group-hover:opacity-100" />
                  </span>
                  <span className="num mt-2 text-2xl font-bold text-foreground">
                    {formatMoney(kpiPayablesThisMonth)}
                  </span>
                  <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    Line-item sum · expected / invoiced / paid
                    <ArrowRight className="h-3 w-3" />
                  </span>
                </button>

                <button
                  type="button"
                  className={kpiTileClass}
                  onClick={() =>
                    navigateWith("payables", {
                      monthRange: { from: fytdMonthRange.from, to: fytdMonthRange.to },
                      billingTypes: ["payable"],
                      statuses: ["expected", "invoiced", "paid"],
                    })
                  }
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Publisher Invoices (FY to date)
                    </span>
                    <CalendarRange className="h-4 w-4 shrink-0 text-muted-foreground opacity-70 group-hover:opacity-100" />
                  </span>
                  <span className="num mt-2 text-2xl font-bold text-foreground">
                    {formatMoney(kpiPayablesFytd)}
                  </span>
                  <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    Delivery schedule · FY{fyDisplayLabel(fyStart)} · through {currentMonth}
                    <ArrowRight className="h-3 w-3" />
                  </span>
                </button>

                <button
                  type="button"
                  className={kpiTileClass}
                  onClick={() =>
                    navigateWith("accrual", {
                      monthRange: { from: fytdMonthRange.from, to: fytdMonthRange.to },
                    })
                  }
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Net accrual
                    </span>
                    <Scale className="h-4 w-4 shrink-0 text-muted-foreground opacity-70 group-hover:opacity-100" />
                  </span>
                  <span
                    className={cn(
                      "num mt-2 text-2xl font-bold",
                      kpiNetAccrualFytd > 0 && "text-status-ahead-fg",
                      kpiNetAccrualFytd < 0 && "text-destructive"
                    )}
                  >
                    {kpiNetAccrualFytd > 0 ? "+" : ""}
                    {formatMoney(kpiNetAccrualFytd)}
                  </span>
                  <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    FY to date · {fytdMonthRange.from} → {fytdMonthRange.to}
                    <ArrowRight className="h-3 w-3" />
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </PageHeroShell>
    </div>
  )
}

export default function FinanceOverviewPanel() {
  const {
    chartsLoading,
    loadError,
    publisherSpendData,
    clientSpendData,
    dashboardClientTreemapColors,
    dashboardMonthlyClientSeriesColors,
    monthlyClientSpend,
    monthlyPublisherSpend,
    attentionItems,
    onAttentionClick,
  } = useFinanceOverview()

  const monthlyClientStackedRows = useMemo(
    () =>
      monthlyClientSpend.map((m) => ({
        month: m.month,
        ...m.data.reduce(
          (acc, item) => {
            acc[item.client] = Math.round(item.amount)
            return acc
          },
          {} as Record<string, number>,
        ),
      })),
    [monthlyClientSpend],
  )

  const monthlyClientStackedSeries = useMemo(() => {
    const keys = new Set<string>()
    for (const row of monthlyClientStackedRows) {
      for (const k of Object.keys(row)) {
        if (k !== "month") keys.add(k)
      }
    }
    return Array.from(keys)
      .sort()
      .map((key) => ({ key, label: key }))
  }, [monthlyClientStackedRows])

  const monthlyPublisherStackedRows = useMemo(
    () =>
      monthlyPublisherSpend.map((m) => ({
        month: m.month,
        ...m.data.reduce(
          (acc, item) => {
            acc[item.publisher] = Math.round(item.amount)
            return acc
          },
          {} as Record<string, number>,
        ),
      })),
    [monthlyPublisherSpend],
  )

  const monthlyPublisherStackedSeries = useMemo(() => {
    const keys = new Set<string>()
    for (const row of monthlyPublisherStackedRows) {
      for (const k of Object.keys(row)) {
        if (k !== "month") keys.add(k)
      }
    }
    return Array.from(keys)
      .sort()
      .map((key, i) => ({
        key,
        label: key,
        color: `var(--av-chart-${(i % 8) + 1})`,
      }))
  }, [monthlyPublisherStackedRows])

  const monthlyClientStackedSeriesColored = useMemo(
    () =>
      monthlyClientStackedSeries.map((s, i) => ({
        ...s,
        color:
          dashboardMonthlyClientSeriesColors[s.key] ??
          `var(--av-chart-${(i % 8) + 1})`,
      })),
    [monthlyClientStackedSeries, dashboardMonthlyClientSeriesColors],
  )

  const publisherTreemapData = useMemo(
    () => reshapeSpendTreemap(publisherSpendData),
    [publisherSpendData],
  )

  const clientTreemapData = useMemo(
    () => reshapeSpendTreemap(clientSpendData, dashboardClientTreemapColors),
    [clientSpendData, dashboardClientTreemapColors],
  )

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
            Performance insights
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Same breakdowns as the admin dashboard — media cost from schedules, current financial year.
          </p>
        </div>
        {chartsLoading ? (
          <LoadingState rows={4} />
        ) : loadError ? (
          <ErrorState title="Could not load finance overview" message={loadError} />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="overflow-hidden rounded-card border border-border bg-card shadow-e1">
                <BaseChartCard
                  title="Spend via Publisher"
                  subtitle="Media cost only - Current financial year"
                  className={cn("rounded-card border-0 shadow-none", chartCardQuiet)}
                >
                  <TreemapChart
                    data={publisherTreemapData}
                    valueFormat="dollars"
                    className="min-h-[280px] w-full"
                  />
                </BaseChartCard>
              </div>
              <div className="overflow-hidden rounded-card border border-border bg-card shadow-e1">
                <BaseChartCard
                  title="Spend via Client"
                  subtitle="Media cost only - Current financial year"
                  className={cn("rounded-card border-0 shadow-none", chartCardQuiet)}
                >
                  <TreemapChart
                    data={clientTreemapData}
                    valueFormat="dollars"
                    className="min-h-[280px] w-full"
                  />
                </BaseChartCard>
              </div>
            </div>
            <BaseChartCard
              title="Monthly Spend by Client"
              subtitle="Media cost by client per month (current FY, billing schedule)"
              className="overflow-hidden rounded-card border border-border bg-card shadow-e1"
            >
              <StackedBarChart
                data={monthlyClientStackedRows}
                xKey="month"
                series={monthlyClientStackedSeriesColored}
                valueFormat="dollars"
                className="min-h-[300px] w-full"
              />
            </BaseChartCard>
            <BaseChartCard
              title="Monthly Spend by Publisher"
              subtitle="Media cost by publisher per month (current FY, billing schedule)"
              className="overflow-hidden rounded-card border border-border bg-card shadow-e1"
            >
              <StackedBarChart
                data={monthlyPublisherStackedRows}
                xKey="month"
                series={monthlyPublisherStackedSeries}
                valueFormat="dollars"
                className="min-h-[300px] w-full"
              />
            </BaseChartCard>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <AlertTriangle className="h-4 w-4 text-status-behind-fg" />
          Needs attention
        </h3>
        {attentionItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing flagged for the current data.</p>
        ) : (
          <ScrollArea className="h-[min(360px,50vh)] rounded-card border border-border">
            <ul className="divide-y divide-border/60 p-2">
              {attentionItems.map((item) => (
                <li key={item.id}>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto w-full justify-start whitespace-normal px-3 py-3 text-left"
                    onClick={() => onAttentionClick(item)}
                  >
                    <div>
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.subtitle}</p>
                    </div>
                  </Button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
