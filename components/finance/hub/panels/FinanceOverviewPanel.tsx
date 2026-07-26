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
  HorizontalBarChart,
  StackedBarChart,
  TreemapChart,
} from "@/components/charts/system"
import { reshapeSpendTreemap } from "@/components/dashboard/dashboardChartReshape"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
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
import {
  formatCurrentMonthKpiLabel,
  monthRangeCoversFyToDate,
  resolveAsyncKpiState,
  resolveNetAccrualKpiState,
  resolveOverviewSpendChartMode,
  type AsyncKpiState,
  type NetAccrualKpiState,
  type OverviewSpendChartMode,
} from "@/lib/finance/financeOverviewDisplay"
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
  fyMonthRange,
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
  showFullFy: () => void
  loading: boolean
  chartsLoading: boolean
  chartsError: string | null
  loadError: string | null
  fyStart: number
  currentMonth: string
  currentMonthLabel: string
  hubRangeLabel: string
  kpiTileClass: string
  currentMonthKpiState: AsyncKpiState
  scheduleFytdKpiState: AsyncKpiState
  netAccrualKpiState: NetAccrualKpiState
  spendChartMode: OverviewSpendChartMode
  rangeCoversFyToDate: boolean
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
  const [chartsError, setChartsError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [currentMonthLoading, setCurrentMonthLoading] = useState(true)
  const [scheduleFytd, setScheduleFytd] = useState({ billingYtd: 0, deliveryYtd: 0 })
  const [scheduleFytdLoading, setScheduleFytdLoading] = useState(true)
  const [scheduleFytdError, setScheduleFytdError] = useState<string | null>(null)
  const [currentMonthBillingRecords, setCurrentMonthBillingRecords] = useState<BillingRecord[]>([])
  const [currentMonthPayablesRecords, setCurrentMonthPayablesRecords] = useState<BillingRecord[]>([])

  const currentMonth = format(new Date(), "yyyy-MM")
  const currentMonthLabel = formatCurrentMonthKpiLabel(currentMonth)
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
      setScheduleFytdLoading(true)
      setScheduleFytdError(null)
      try {
        const res = await fetch(`/api/finance/hub-schedule-ytd?fy=${fyStart}`, { cache: "no-store" })
        if (!res.ok) {
          throw new Error(`Schedule FYTD unavailable (${res.status})`)
        }
        const body = (await res.json()) as {
          billingScheduleYtd?: number
          deliveryScheduleYtd?: number
        }
        if (cancelled) return
        setScheduleFytd({
          billingYtd: Math.round(Number(body.billingScheduleYtd ?? 0) * 100) / 100,
          deliveryYtd: Math.round(Number(body.deliveryScheduleYtd ?? 0) * 100) / 100,
        })
      } catch (e) {
        if (!cancelled) {
          setScheduleFytd({ billingYtd: 0, deliveryYtd: 0 })
          setScheduleFytdError(e instanceof Error ? e.message : "Failed to load schedule FYTD")
        }
      } finally {
        if (!cancelled) setScheduleFytdLoading(false)
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
    setCurrentMonthLoading(true)
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
      } finally {
        if (!cancelled) setCurrentMonthLoading(false)
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
      setChartsError(null)
      try {
        const [monthlyPubResp, monthlyClientResp] = await Promise.all([
          fetch("/api/dashboard/global-monthly-publisher-spend"),
          fetch("/api/dashboard/global-monthly-client-spend"),
        ])
        if (!monthlyPubResp.ok && !monthlyClientResp.ok) {
          throw new Error(
            `Dashboard monthly spend unavailable (${monthlyPubResp.status}/${monthlyClientResp.status})`
          )
        }
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
        if (!monthlyPubResp.ok || !monthlyClientResp.ok) {
          setChartsError(
            "One or more dashboard_monthly_* spend feeds returned non-OK; showing whatever loaded."
          )
        }
      } catch (e) {
        if (!cancelled) {
          setMonthlyPublisherSpend([])
          setMonthlyClientSpend([])
          setClientProfileColors({})
          setChartsError(e instanceof Error ? e.message : "Failed to load spend charts")
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

  const showFullFy = useCallback(() => {
    setFilters({ monthRange: fyMonthRange(fyStart) })
  }, [fyStart, setFilters])

  const loading = billingLoading || payablesLoading

  const rangeCoversFy = useMemo(
    () => monthRangeCoversFyToDate(filters.monthRange, fyMonthsToDate),
    [filters.monthRange, fyMonthsToDate]
  )

  const currentMonthKpiState = resolveAsyncKpiState({
    loading: currentMonthLoading,
    error: loadError,
  })
  const scheduleFytdKpiState = resolveAsyncKpiState({
    loading: scheduleFytdLoading,
    error: scheduleFytdError,
  })
  const netAccrualKpiState = resolveNetAccrualKpiState({
    storeLoading: loading,
    rangeCoversFyToDate: rangeCoversFy,
  })

  const treemapHasData = clientSpendData.length > 0 || publisherSpendData.length > 0
  const fyBillingBarHasData = fyClientBillingRows.length > 0
  const spendChartMode = resolveOverviewSpendChartMode({
    chartsLoading,
    storeLoading: loading,
    treemapHasData,
    fyBillingBarHasData,
    rangeCoversFyToDate: rangeCoversFy,
  })

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
      showFullFy,
      loading,
      chartsLoading,
      chartsError,
      loadError,
      fyStart,
      currentMonth,
      currentMonthLabel,
      hubRangeLabel,
      kpiTileClass,
      currentMonthKpiState,
      scheduleFytdKpiState,
      netAccrualKpiState,
      spendChartMode,
      rangeCoversFyToDate: rangeCoversFy,
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
      showFullFy,
      loading,
      chartsLoading,
      chartsError,
      loadError,
      fyStart,
      currentMonth,
      currentMonthLabel,
      hubRangeLabel,
      kpiTileClass,
      currentMonthKpiState,
      scheduleFytdKpiState,
      netAccrualKpiState,
      spendChartMode,
      rangeCoversFy,
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

function OverviewKpiValue({
  state,
  value,
  deferredAction,
  signed,
}: {
  state: AsyncKpiState | NetAccrualKpiState
  value: number
  deferredAction?: ReactNode
  signed?: boolean
}) {
  if (state === "loading") {
    return <Skeleton className="mt-2 h-8 w-28" aria-label="Loading" />
  }
  if (state === "error") {
    return (
      <span className="mt-2 text-sm font-medium text-destructive" role="status">
        Unavailable
      </span>
    )
  }
  if (state === "deferred") {
    return (
      <div className="mt-2 space-y-2">
        <span className="num block text-2xl font-bold text-muted-foreground">—</span>
        {deferredAction}
      </div>
    )
  }
  return (
    <span
      className={cn(
        "num mt-2 text-2xl font-bold text-foreground",
        signed && value > 0 && "text-status-ahead-fg",
        signed && value < 0 && "text-destructive"
      )}
    >
      {signed && value > 0 ? "+" : ""}
      {formatMoney(value)}
    </span>
  )
}

export function FinanceOverviewHero() {
  const {
    navigateWith,
    showFullFy,
    fyStart,
    currentMonth,
    currentMonthLabel,
    hubRangeLabel,
    kpiTileClass,
    currentMonthKpiState,
    scheduleFytdKpiState,
    netAccrualKpiState,
    kpiReceivablesThisMonth,
    kpiReceivablesFytd,
    kpiPayablesThisMonth,
    kpiPayablesFytd,
    kpiNetAccrualFytd,
    fytdMonthRange,
  } = useFinanceOverview()

  // The KPI tile is itself a <button>; the deferred affordance must not nest another
  // button. The tile's onClick runs showFullFy in the deferred state.
  const showFullFyAffordance = (
    <span className="inline-flex h-7 items-center rounded-input border border-border bg-surface-panel px-2 text-xs font-medium text-foreground shadow-e0 group-hover:bg-table-row-hover">
      Show full FY
    </span>
  )

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
                      Client Billing (current month · {currentMonthLabel})
                    </span>
                    <Wallet className="h-4 w-4 shrink-0 text-muted-foreground opacity-70 group-hover:opacity-100" />
                  </span>
                  <OverviewKpiValue state={currentMonthKpiState} value={kpiReceivablesThisMonth} />
                  <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    Calendar month · booked+
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
                  <OverviewKpiValue state={scheduleFytdKpiState} value={kpiReceivablesFytd} />
                  <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    Billing schedule · FY{fyDisplayLabel(fyStart)} · through {currentMonthLabel}
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
                      Publisher Invoices (current month · {currentMonthLabel})
                    </span>
                    <BarChart3 className="h-4 w-4 shrink-0 text-muted-foreground opacity-70 group-hover:opacity-100" />
                  </span>
                  <OverviewKpiValue state={currentMonthKpiState} value={kpiPayablesThisMonth} />
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
                  <OverviewKpiValue state={scheduleFytdKpiState} value={kpiPayablesFytd} />
                  <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    Delivery schedule · FY{fyDisplayLabel(fyStart)} · through {currentMonthLabel}
                    <ArrowRight className="h-3 w-3" />
                  </span>
                </button>

                <button
                  type="button"
                  className={kpiTileClass}
                  onClick={() => {
                    if (netAccrualKpiState === "deferred") {
                      showFullFy()
                      return
                    }
                    navigateWith("accrual", {
                      monthRange: { from: fytdMonthRange.from, to: fytdMonthRange.to },
                    })
                  }}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Net accrual
                    </span>
                    <Scale className="h-4 w-4 shrink-0 text-muted-foreground opacity-70 group-hover:opacity-100" />
                  </span>
                  <OverviewKpiValue
                    state={netAccrualKpiState}
                    value={kpiNetAccrualFytd}
                    signed
                    deferredAction={showFullFyAffordance}
                  />
                  <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    {netAccrualKpiState === "deferred"
                      ? "Needs full FY month range in the hub"
                      : `FY to date · ${fytdMonthRange.from} → ${fytdMonthRange.to}`}
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
    chartsError,
    spendChartMode,
    showFullFy,
    fyStart,
    publisherSpendData,
    clientSpendData,
    fyClientBillingRows,
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

  const fyClientBillingBarRows = useMemo(
    () =>
      fyClientBillingRows.slice(0, 20).map((r) => ({
        client: r.clientName,
        total: Math.round(r.total),
      })),
    [fyClientBillingRows],
  )

  const showMonthlyStacks =
    spendChartMode === "treemap" &&
    (monthlyClientStackedSeriesColored.length > 0 || monthlyPublisherStackedSeries.length > 0)

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
            Performance insights
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Schedule spend from the admin dashboard feeds when available; otherwise FY client billing
            from finance records.
          </p>
        </div>
        {spendChartMode === "loading" ? (
          <LoadingState rows={4} />
        ) : chartsError && spendChartMode === "empty" ? (
          <ErrorState title="Could not load finance overview charts" message={chartsError} />
        ) : spendChartMode === "deferred" ? (
          <EmptyState
            title="FY client billing needs a full year range"
            message={`Spend treemaps from dashboard_monthly_* are empty, and hub month range does not yet cover FY${fyDisplayLabel(fyStart)}. Expand to the full financial year to load the client-billing bar from finance records.`}
            action={
              <Button type="button" size="sm" onClick={showFullFy}>
                Show full FY
              </Button>
            }
          />
        ) : spendChartMode === "empty" ? (
          <EmptyState
            title="Spend charts unavailable"
            message="The upstream dashboard_monthly_client_spend / dashboard_monthly_publisher_spend feed returned empty or non-OK (soft-fail in the API). Finance records for this FY also have no client-billing totals to chart. Follow-up: confirm whether the Xano dashboard_monthly_* tables are unpopulated or the endpoints are broken — these treemaps will not recover until that feed is fixed."
          />
        ) : spendChartMode === "fallback-bar" ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-card border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-e1">
              Schedule spend treemaps are empty because{" "}
              <span className="font-medium text-foreground">dashboard_monthly_*</span> returned
              empty/non-OK. Showing FY client billing from finance records instead. Follow-up: fix
              the Xano dashboard aggregate so treemaps can return.
            </div>
            <div className="overflow-hidden rounded-card border border-border bg-card shadow-e1">
              <BaseChartCard
                title="Client billing by client (FY)"
                subtitle={`Finance records · FY${fyDisplayLabel(fyStart)} · booked / approved / invoiced / paid`}
                className={cn("rounded-card border-0 shadow-none", chartCardQuiet)}
              >
                <HorizontalBarChart
                  data={fyClientBillingBarRows}
                  xKey="client"
                  series={[{ key: "total", label: "Billing", color: "var(--av-chart-1)" }]}
                  valueFormat="dollars"
                  className="min-h-[320px] w-full"
                />
              </BaseChartCard>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="overflow-hidden rounded-card border border-border bg-card shadow-e1">
                {publisherSpendData.length === 0 ? (
                  <EmptyState
                    className="min-h-[280px] border-0 bg-transparent"
                    title="No publisher spend"
                    message="dashboard_monthly_publisher_spend had no positive amounts for the current FY."
                  />
                ) : (
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
                )}
              </div>
              <div className="overflow-hidden rounded-card border border-border bg-card shadow-e1">
                {clientSpendData.length === 0 ? (
                  <EmptyState
                    className="min-h-[280px] border-0 bg-transparent"
                    title="No client spend"
                    message="dashboard_monthly_client_spend had no positive amounts for the current FY."
                  />
                ) : (
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
                )}
              </div>
            </div>
            {showMonthlyStacks ? (
              <>
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
              </>
            ) : null}
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
