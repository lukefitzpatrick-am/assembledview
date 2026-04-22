"use client"

import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from "react"
import { motion } from "framer-motion"
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/layout/Panel"
import { PanelRow, PanelRowCell } from "@/components/layout/PanelRow"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { BarChart3, ChevronDown, FilterX, TrendingUp, ShoppingCart, Users, Search, type LucideIcon } from "lucide-react"
import { useListGridLayoutPreference } from "@/lib/hooks/useListGridLayoutPreference"
import { ListGridToggle } from "@/components/ui/list-grid-toggle"
import {
  DashboardCampaignPlanCard,
  DashboardScopeCard,
  dashboardCampaignGridClassName,
} from "@/components/dashboard/DashboardEntityCards"
import { format } from "date-fns"
import { TreemapShellChart } from "@/components/charts/TreemapShellChart"
import BaseChartCard from "@/components/charts/BaseChartCard"
import { StackedColumnChart } from "@/components/charts/StackedColumnChart"
import type { ChartDatumClickPayload } from "@/components/charts/chartDatumClick"
import { usePathname, useRouter } from "next/navigation"
import { AuthPageLoading } from "@/components/AuthLoadingState"
import { getMediaBadgeStyle } from "@/lib/charts/registry"
import { cn } from "@/lib/utils"
import { compareValues, SortableTableHeader, SortDirection } from "@/components/ui/sortable-table-header"
import { useAuthContext } from "@/contexts/AuthContext"
import { setAssistantContext } from "@/lib/assistantBridge"
import type { PageContext, PageField } from "@/lib/openai"
import {
  DASHBOARD_TEMPLATES,
  buildFiltersForTemplate,
  describeDashboardTimeRange,
  executiveOverviewTemplate,
  getDashboardTemplateById,
  type DashboardTemplateMobileOpen,
  type DashboardTemplatePanels,
} from "@/components/dashboard/templates"
import { Label } from "@/components/ui/label"
import { MediaPlanEditorHero } from "@/components/mediaplans/MediaPlanEditorHero"

// Types reused from the original dashboard page
type MediaPlan = {
  id: number
  mp_clientname: string
  mp_campaignname: string
  mp_mba_number: string
  mp_version: number
  mp_brand: string
  mp_campaignstatus: string
  mp_campaigndates_start: string
  mp_campaigndates_end: string
  mp_campaignbudget: number
  mp_television: boolean
  mp_radio: boolean
  mp_newspaper: boolean
  mp_magazines: boolean
  mp_ooh: boolean
  mp_cinema: boolean
  mp_digidisplay: boolean
  mp_digiaudio: boolean
  mp_digivideo: boolean
  mp_bvod: boolean
  mp_integration: boolean
  mp_search: boolean
  mp_socialmedia: boolean
  mp_progdisplay: boolean
  mp_progvideo: boolean
  mp_progbvod: boolean
  mp_progaudio: boolean
  mp_progooh: boolean
  mp_influencers: boolean
  billingSchedule?: any
  deliverySchedule?: any
}

interface ScopeOfWork {
  id: number
  created_at: number
  client_name: string
  contact_name: string
  contact_email: string
  scope_date: string
  scope_version: number
  project_name: string
  project_status: string
  project_overview: string
  deliverables: string
  tasks_steps: string
  timelines: string
  responsibilities: string
  requirements: string
  assumptions: string
  exclusions: string
  cost: any
  payment_terms_and_conditions: string
}

interface DashboardOverviewProps {
  /** Path used for login redirect when unauthenticated */
  returnTo?: string
  /** Optional title override */
  title?: string
  /** Hide the top metric cards */
  showMetrics?: boolean
  /** Hide the campaign/scope tables */
  showTables?: boolean
}

type SortableValue = string | number | Date | boolean | null | undefined

type SortState = {
  column: string
  direction: SortDirection
}

type DashboardMetricCard = {
  title: string
  value: string
  icon: LucideIcon
  tooltip: string
  color: string
  gradient: string
  iconBg: string
  iconText: string
}

const LIVE_STATUSES = ["booked", "approved", "completed"]

/** Top spend rows in the FY client table that may show a monthly trend sparkline. */
const DASHBOARD_CLIENT_SPARKLINE_TOP_N = 8

const normalizeStatus = (status?: string | null) => (status || "").toString().toLowerCase().trim()

const normalizeClientFilterValue = (value: string) =>
  value
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")

/** Match spend labels (`mp_clientname`, version `mp_client_name`) to Xano client profile keys. */
function resolveClientProfileColour(
  displayName: string,
  clientColors: Record<string, string>,
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

type MonthlyClientSpendBucket = { month: string; data: Array<{ client: string; amount: number }> }

function extractClientMonthlySeries(monthly: MonthlyClientSpendBucket[], clientName: string): number[] | null {
  if (!monthly.length) return null
  const norm = normalizeClientFilterValue(clientName)
  const series = monthly.map((m) => {
    const hit =
      m.data.find((d) => d.client === clientName) ??
      m.data.find((d) => normalizeClientFilterValue(d.client) === norm)
    const raw = hit?.amount
    const n = typeof raw === "number" && Number.isFinite(raw) ? raw : 0
    return Math.max(0, n)
  })
  if (!series.some((v) => v > 0)) return null
  return series
}

function MonthlySpendSparkline({ values, stroke }: { values: number[]; stroke?: string }) {
  const w = 80
  const h = 28
  const pad = 2
  if (values.length === 0) return null
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const innerW = w - pad * 2
  const innerH = h - pad * 2
  const pts = values
    .map((v, i) => {
      const x = pad + (values.length === 1 ? innerW / 2 : (i / (values.length - 1)) * innerW)
      const y = pad + innerH - ((v - min) / range) * innerH
      return `${x},${y}`
    })
    .join(" ")
  const lineStroke = stroke?.trim() ? stroke : "hsl(var(--primary))"
  return (
    <svg width={w} height={h} className="shrink-0 overflow-visible" aria-hidden>
      <polyline
        fill="none"
        stroke={lineStroke}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
      />
    </svg>
  )
}

const slugifyClientName = (name?: string | null) => {
  if (!name || typeof name !== "string") return ""
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .trim()
}

/** Dashboard table + chart-driven filters (URL-synced). */
export type DashboardViewFilters = {
  campaignSearch: string
  /** Normalized client keys (same values as the client multi-select). */
  clients: string[]
  /** Publisher names as they appear on billing line items / charts. */
  publishers: string[]
  /** Month label aligned with stacked charts / billing `monthYear` (e.g. "July 2024"). */
  month: string | null
}

const defaultDashboardViewFilters = (): DashboardViewFilters => ({
  campaignSearch: "",
  clients: [],
  publishers: [],
  month: null,
})

const normalizeMonthKeyForMatch = (value: string | null | undefined) =>
  (value || "").toString().trim().toLowerCase().replace(/\s+/g, " ")

const billingScheduleMatchesMonth = (schedule: any, monthFilter: string | null): boolean => {
  if (!monthFilter || !String(monthFilter).trim()) return true

  const target = normalizeMonthKeyForMatch(monthFilter)
  if (!target) return true

  let scheduleArray: any[] = []
  if (Array.isArray(schedule)) {
    scheduleArray = schedule
  } else if (schedule?.months && Array.isArray(schedule.months)) {
    scheduleArray = schedule.months
  } else {
    return false
  }

  return scheduleArray.some((entry: any) => {
    const my = entry?.monthYear
    if (!my || typeof my !== "string") return false
    return normalizeMonthKeyForMatch(my) === target
  })
}

const parseDashboardFiltersFromSearchParams = (sp: URLSearchParams): DashboardViewFilters => ({
  campaignSearch: sp.get("q") ?? "",
  clients: sp.getAll("client").filter(Boolean),
  publishers: sp.getAll("publisher").filter(Boolean),
  month: sp.get("month")?.trim() || null,
})

const buildDashboardFiltersSearchParams = (
  debouncedSearch: string,
  clients: string[],
  publishers: string[],
  month: string | null,
) => {
  const params = new URLSearchParams()
  const q = debouncedSearch.trim()
  if (q) params.set("q", q)
  clients.forEach((c) => {
    if (c) params.append("client", c)
  })
  publishers.forEach((p) => {
    if (p) params.append("publisher", p)
  })
  if (month && month.trim()) params.set("month", month.trim())
  return params
}

function cloneDashboardViewFilters(f: DashboardViewFilters): DashboardViewFilters {
  return {
    campaignSearch: f.campaignSearch,
    clients: [...f.clients],
    publishers: [...f.publishers],
    month: f.month,
  }
}

function dashboardViewFiltersEqual(a: DashboardViewFilters, b: DashboardViewFilters): boolean {
  if (a.campaignSearch !== b.campaignSearch || a.month !== b.month) return false
  if (a.clients.length !== b.clients.length || a.publishers.length !== b.publishers.length) return false
  const ac = [...a.clients].sort()
  const bc = [...b.clients].sort()
  for (let i = 0; i < ac.length; i++) if (ac[i] !== bc[i]) return false
  const ap = [...a.publishers].sort()
  const bp = [...b.publishers].sort()
  for (let i = 0; i < ap.length; i++) if (ap[i] !== bp[i]) return false
  return true
}

const searchParamsHasAnyDashboardFilters = (sp: URLSearchParams): boolean =>
  Boolean(
    (sp.get("q") || "").trim() ||
      sp.getAll("client").filter(Boolean).length ||
      sp.getAll("publisher").filter(Boolean).length ||
      (sp.get("month") || "").trim(),
  )

export type SavedDashboardViewRecord = {
  id: string
  name: string
  filters: DashboardViewFilters
  templateId: string
  panels: DashboardTemplatePanels
  mobileOpen: DashboardTemplateMobileOpen
  createdAt: string
}

function normalizeDashboardTemplatePanels(raw: unknown): DashboardTemplatePanels {
  const d = executiveOverviewTemplate.panels
  if (!raw || typeof raw !== "object") return { ...d }
  const p = raw as Record<string, unknown>
  return {
    keyMetrics: Boolean(p.keyMetrics),
    spendBreakdown: Boolean(p.spendBreakdown),
    monthlyTrends: Boolean(p.monthlyTrends),
    liveCampaigns: Boolean(p.liveCampaigns),
    scopes: Boolean(p.scopes),
    dueSoon: Boolean(p.dueSoon),
    finishedRecently: Boolean(p.finishedRecently),
  }
}

function normalizeDashboardTemplateMobileOpen(raw: unknown): DashboardTemplateMobileOpen {
  const d = executiveOverviewTemplate.mobileOpen
  if (!raw || typeof raw !== "object") return { ...d }
  const p = raw as Record<string, unknown>
  return {
    monthlyTrends: Boolean(p.monthlyTrends),
    scopes: Boolean(p.scopes),
    dueSoon: Boolean(p.dueSoon),
    finishedRecently: Boolean(p.finishedRecently),
  }
}

function normalizeSavedDashboardViewEntry(x: unknown): SavedDashboardViewRecord | null {
  if (!x || typeof x !== "object") return null
  const o = x as Record<string, unknown>
  if (typeof o.id !== "string" || typeof o.name !== "string") return null
  const f = o.filters
  if (!f || typeof f !== "object" || Array.isArray(f)) return null
  const fr = f as Record<string, unknown>
  const filters: DashboardViewFilters = {
    campaignSearch: typeof fr.campaignSearch === "string" ? fr.campaignSearch : "",
    clients: Array.isArray(fr.clients) ? fr.clients.map((c) => String(c)).filter(Boolean) : [],
    publishers: Array.isArray(fr.publishers) ? fr.publishers.map((p) => String(p)).filter(Boolean) : [],
    month:
      typeof fr.month === "string" && fr.month.trim()
        ? fr.month.trim()
        : null,
  }
  const templateId =
    typeof o.templateId === "string" && getDashboardTemplateById(o.templateId)
      ? o.templateId
      : executiveOverviewTemplate.id
  return {
    id: o.id,
    name: o.name,
    filters,
    templateId,
    panels: normalizeDashboardTemplatePanels(o.panels),
    mobileOpen: normalizeDashboardTemplateMobileOpen(o.mobileOpen),
    createdAt: typeof o.createdAt === "string" ? o.createdAt : new Date().toISOString(),
  }
}

function parseSavedViewsFromStorageJson(raw: string | null): SavedDashboardViewRecord[] {
  if (!raw) return []
  try {
    const p = JSON.parse(raw) as unknown
    if (Array.isArray(p)) {
      return p.map(normalizeSavedDashboardViewEntry).filter((v): v is SavedDashboardViewRecord => v != null)
    }
    if (p && typeof p === "object" && Array.isArray((p as { views?: unknown }).views)) {
      return ((p as { views: unknown[] }).views || [])
        .map(normalizeSavedDashboardViewEntry)
        .filter((v): v is SavedDashboardViewRecord => v != null)
    }
  } catch {
    // ignore
  }
  return []
}

function serializeSavedViewsToStorageJson(views: SavedDashboardViewRecord[]): string {
  return JSON.stringify({ views })
}

function applyTemplateToDashboardUi(
  templateId: string,
  setters: {
    setSelectedTemplateId: (id: string) => void
    setLayoutPanels: (p: DashboardTemplatePanels) => void
    setOpenMonthlyCharts: (v: boolean) => void
    setOpenScopesPanel: (v: boolean) => void
    setOpenDueSoonPanel: (v: boolean) => void
    setOpenFinishedPanel: (v: boolean) => void
    setTimeRangeDescription: (s: string) => void
    setDashboardFilters: (f: DashboardViewFilters) => void
    setBaselineTemplateId: (id: string | null) => void
  },
  options?: { setBaseline?: boolean },
) {
  const template = getDashboardTemplateById(templateId)
  if (!template) return
  const setBaseline = options?.setBaseline !== false
  setters.setSelectedTemplateId(template.id)
  setters.setLayoutPanels({ ...template.panels })
  setters.setOpenMonthlyCharts(template.mobileOpen.monthlyTrends)
  setters.setOpenScopesPanel(template.mobileOpen.scopes)
  setters.setOpenDueSoonPanel(template.mobileOpen.dueSoon)
  setters.setOpenFinishedPanel(template.mobileOpen.finishedRecently)
  setters.setTimeRangeDescription(describeDashboardTimeRange(template.timeRange))
  setters.setDashboardFilters(buildFiltersForTemplate(template))
  if (setBaseline) setters.setBaselineTemplateId(template.id)
}

const getTodayBounds = () => {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)
  return { startOfToday, endOfToday }
}

const getLatestPlanVersions = (plans: MediaPlan[]): MediaPlan[] => {
  const latestVersionsMap = new Map<string, MediaPlan>()
  plans.forEach((plan) => {
    const existing = latestVersionsMap.get(plan.mp_mba_number)
    if (!existing || plan.mp_version > existing.mp_version) {
      latestVersionsMap.set(plan.mp_mba_number, plan)
    }
  })
  return Array.from(latestVersionsMap.values())
}

/**
 * Per MBA, use the highest-version plan that is booked, approved, or completed.
 * Aligns FY spend tables with global monthly APIs: a newer draft must not hide
 * an approved/booked/completed version used for delivery/billing.
 */
function getHighestBookedApprovedCompletedVersionPerMba(plans: MediaPlan[]): MediaPlan[] {
  const byMba = new Map<string, MediaPlan[]>()
  for (const plan of plans) {
    const mba = plan.mp_mba_number
    if (mba == null || String(mba).trim() === "") continue
    const key = String(mba)
    const list = byMba.get(key) ?? []
    list.push(plan)
    byMba.set(key, list)
  }
  const out: MediaPlan[] = []
  for (const [, group] of byMba) {
    const eligible = group.filter((p) => {
      const status = normalizeStatus(p.mp_campaignstatus)
      return status !== "" && LIVE_STATUSES.includes(status)
    })
    if (eligible.length === 0) continue
    const best = eligible.reduce((a, b) => {
      const va = Number(a.mp_version) || 0
      const vb = Number(b.mp_version) || 0
      return va >= vb ? a : b
    })
    out.push(best)
  }
  return out
}

// Helper function to get the current Australian Financial Year dates
const getCurrentFinancialYear = () => {
  const today = new Date()
  const currentMonth = today.getMonth() // 0-11 (Jan-Dec)
  const currentYear = today.getFullYear()

  const startYear = currentMonth >= 6 ? currentYear : currentYear - 1
  const startDate = new Date(startYear, 6, 1) // July 1st
  const endDate = new Date(startYear + 1, 5, 30) // June 30th

  return { startDate, endDate }
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount)

const formatDate = (dateString: string) => format(new Date(dateString), "MMM d, yyyy")

type DashboardErrorCopy = { title: string; detail: string }

function toDashboardFetchError(error: unknown): DashboardErrorCopy {
  const title = "We couldn't load the dashboard"
  if (error instanceof Error) {
    const msg = error.message
    if (msg.startsWith("Failed to fetch media plans:")) {
      const status = msg.replace(/^Failed to fetch media plans:\s*/i, "").trim()
      return {
        title,
        detail: `The media plans request failed (${status}). Charts and tables won't update until this succeeds.`,
      }
    }
    if (msg === "Failed to fetch media plans") {
      return {
        title,
        detail: "We couldn't reach the server for media plans. Check your connection.",
      }
    }
  }
  return {
    title,
    detail: "Something went wrong while loading this page.",
  }
}

function authErrorCopy(authError: unknown): DashboardErrorCopy {
  return {
    title: "We couldn't verify your sign-in",
    detail:
      authError instanceof Error && authError.message.trim()
        ? authError.message.trim()
        : "Your session could not be loaded from the server.",
  }
}

function DashboardPageErrorPanel({
  title,
  detail,
  onRetry,
}: {
  title: string
  detail: string
  onRetry: () => void
}) {
  return (
    <div className="container mx-auto px-4 py-8">
      <Panel variant="error" className="max-w-3xl overflow-hidden border-0 shadow-md">
        <div className="h-1 bg-gradient-to-r from-destructive via-destructive/70 to-destructive/40" />
        <PanelHeader>
          <PanelTitle>{title}</PanelTitle>
        </PanelHeader>
        <PanelContent>
          <div
            role="alert"
            className={cn(
              "flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive",
              "sm:flex-row sm:items-center sm:justify-between"
            )}
          >
            <p className="min-w-0 flex-1">{detail}</p>
            <Button
              type="button"
              variant="outline"
              className="w-full shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 sm:w-auto h-8 text-xs"
              onClick={onRetry}
            >
              Retry
            </Button>
          </div>
        </PanelContent>
      </Panel>
    </div>
  )
}

const parseBillingScheduleAmount = (amountStr: string | number): number => {
  if (typeof amountStr === "number") return amountStr
  if (!amountStr || typeof amountStr !== "string") return 0
  const cleaned = amountStr.replace(/[$,]/g, "").trim()
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? 0 : parsed
}

const parseMonthYear = (monthYear: string): Date | null => {
  try {
    const parts = monthYear.trim().split(" ")
    if (parts.length !== 2) return null

    const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]
    const monthAbbr = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]

    const monthStr = parts[0].toLowerCase()
    const year = parseInt(parts[1])

    let monthIndex = monthNames.indexOf(monthStr)
    if (monthIndex === -1) {
      monthIndex = monthAbbr.indexOf(monthStr)
    }

    if (monthIndex === -1 || isNaN(year)) return null

    return new Date(year, monthIndex, 1)
  } catch {
    return null
  }
}

const extractPublishersFromSchedule = (schedule: any): Set<string> => {
  const publishers = new Set<string>()
  if (!schedule) return publishers

  let scheduleArray: any[] = []
  if (Array.isArray(schedule)) {
    scheduleArray = schedule
  } else if (schedule.months && Array.isArray(schedule.months)) {
    scheduleArray = schedule.months
  } else {
    return publishers
  }

  scheduleArray.forEach((entry: any) => {
    if (entry.mediaTypes && Array.isArray(entry.mediaTypes)) {
      entry.mediaTypes.forEach((mediaType: any) => {
        if (mediaType.lineItems && Array.isArray(mediaType.lineItems)) {
          mediaType.lineItems.forEach((lineItem: any) => {
            if (lineItem.header1 && lineItem.header1.trim() !== "") {
              publishers.add(lineItem.header1.trim())
            }
          })
        }
      })
    }
  })

  return publishers
}

const planHasAnyPublisher = (plan: MediaPlan, publishers: string[]): boolean => {
  if (!publishers.length) return true
  const schedule = plan.deliverySchedule ?? plan.billingSchedule
  const pubSet = extractPublishersFromSchedule(schedule)
  return publishers.some((p) => pubSet.has(p))
}

const normalizeDashboardSearch = (value: string) => value.toLowerCase().trim()

function applyDashboardTableFiltersToPlans(plans: MediaPlan[], filters: DashboardViewFilters): MediaPlan[] {
  const searchLower = normalizeDashboardSearch(filters.campaignSearch)
  const selectedClients = new Set(filters.clients.map((value) => normalizeClientFilterValue(value)).filter(Boolean))

  return plans.filter((plan) => {
    const clientKey = normalizeClientFilterValue(plan.mp_clientname || "")
    if (selectedClients.size > 0 && !selectedClients.has(clientKey)) return false

    if (searchLower) {
      const haystack = [
        plan.mp_clientname,
        plan.mp_campaignname,
        plan.mp_mba_number,
        plan.mp_brand,
        plan.mp_campaignstatus,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      if (!haystack.includes(searchLower)) return false
    }

    if (!planHasAnyPublisher(plan, filters.publishers)) return false

    const schedule = plan.deliverySchedule ?? plan.billingSchedule
    if (!billingScheduleMatchesMonth(schedule, filters.month)) return false

    return true
  })
}

function applyDashboardTableFiltersToScopes(scopes: ScopeOfWork[], filters: DashboardViewFilters): ScopeOfWork[] {
  const selectedClients = new Set(filters.clients.map((value) => normalizeClientFilterValue(value)).filter(Boolean))

  if ((filters.publishers.length > 0 || filters.month) && selectedClients.size === 0) {
    return []
  }

  if (selectedClients.size === 0) return scopes

  return scopes.filter((scope) => selectedClients.has(normalizeClientFilterValue(scope.client_name || "")))
}

const extractSpendFromSchedule = (schedule: any, fyStartDate: Date, fyEndDate: Date): { publisherSpend: Record<string, number>; totalSpend: number } => {
  const publisherSpend: Record<string, number> = {}
  let totalSpend = 0
  if (!schedule) return { publisherSpend, totalSpend }

  let scheduleArray: any[] = []
  if (Array.isArray(schedule)) {
    scheduleArray = schedule
  } else if (schedule.months && Array.isArray(schedule.months)) {
    scheduleArray = schedule.months
  } else {
    return { publisherSpend, totalSpend }
  }

  scheduleArray.forEach((entry: any) => {
    const monthDate = parseMonthYear(entry.monthYear)
    if (!monthDate) return

    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)

    if (monthStart <= fyEndDate && monthEnd >= fyStartDate) {
      if (entry.mediaTypes && Array.isArray(entry.mediaTypes)) {
        entry.mediaTypes.forEach((mediaType: any) => {
          if (mediaType.lineItems && Array.isArray(mediaType.lineItems)) {
            mediaType.lineItems.forEach((lineItem: any) => {
              const amount = parseBillingScheduleAmount(lineItem.amount)
              if (amount > 0 && lineItem.header1 && lineItem.header1.trim() !== "") {
                const publisher = lineItem.header1.trim()
                publisherSpend[publisher] = (publisherSpend[publisher] || 0) + amount
                totalSpend += amount
              }
            })
          }
        })
      }
    }
  })

  return { publisherSpend, totalSpend }
}

const transformMediaPlanData = (apiData: any[]): MediaPlan[] =>
  apiData.map((item: any) => {
    let billingSchedule = item.billingSchedule
    let deliverySchedule = item.deliverySchedule
    if (billingSchedule && typeof billingSchedule === "string") {
      try {
        billingSchedule = JSON.parse(billingSchedule)
      } catch {
        billingSchedule = null
      }
    }
    if (deliverySchedule && typeof deliverySchedule === "string") {
      try {
        deliverySchedule = JSON.parse(deliverySchedule)
      } catch {
        deliverySchedule = null
      }
    }

    return {
      id: item.id || 0,
      mp_clientname: item.mp_client_name || item.mp_clientname || "",
      mp_campaignname: item.campaign_name || item.mp_campaignname || "",
      mp_mba_number: item.mba_number || item.mp_mba_number || "",
      mp_version: item.version_number || item.mp_version || 1,
      mp_brand: item.brand || "",
      mp_campaignstatus: item.campaign_status || item.mp_campaignstatus || "",
      mp_campaigndates_start: item.campaign_start_date || item.mp_campaigndates_start || "",
      mp_campaigndates_end: item.campaign_end_date || item.mp_campaigndates_end || "",
      mp_campaignbudget: item.mp_campaignbudget || 0,
      mp_television: item.mp_television || false,
      mp_radio: item.mp_radio || false,
      mp_newspaper: item.mp_newspaper || false,
      mp_magazines: item.mp_magazines || false,
      mp_ooh: item.mp_ooh || false,
      mp_cinema: item.mp_cinema || false,
      mp_digidisplay: item.mp_digidisplay || false,
      mp_digiaudio: item.mp_digiaudio || false,
      mp_digivideo: item.mp_digivideo || false,
      mp_bvod: item.mp_bvod || false,
      mp_integration: item.mp_integration || false,
      mp_search: item.mp_search || false,
      mp_socialmedia: item.mp_socialmedia || false,
      mp_progdisplay: item.mp_progdisplay || false,
      mp_progvideo: item.mp_progvideo || false,
      mp_progbvod: item.mp_progbvod || false,
      mp_progaudio: item.mp_progaudio || false,
      mp_progooh: item.mp_progooh || false,
      mp_influencers: item.mp_influencers || false,
      billingSchedule: billingSchedule || undefined,
      deliverySchedule: deliverySchedule || undefined,
    }
  })

function useIsMd() {
  const [isMd, setIsMd] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)")
    const update = () => setIsMd(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])
  return isMd
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

type MobileCollapsibleSectionProps = {
  isMd: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  helperText?: ReactNode
  children: ReactNode
  className?: string
}

function MobileCollapsibleSection({
  isMd,
  open,
  onOpenChange,
  title,
  helperText,
  children,
  className,
}: MobileCollapsibleSectionProps) {
  const expanded = isMd || open
  return (
    <Collapsible
      open={expanded}
      onOpenChange={(v) => {
        if (!isMd) onOpenChange(v)
      }}
      className={cn("space-y-4", className)}
    >
      {isMd ? (
        <div className="space-y-1">
          <h3 className="text-sm font-semibold leading-none tracking-tight text-foreground">{title}</h3>
          {helperText != null ? <p className="text-xs text-muted-foreground/80">{helperText}</p> : null}
        </div>
      ) : (
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-start gap-2 rounded-md py-1 text-left outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronDown
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                expanded && "rotate-180"
              )}
            />
            <div className="min-w-0 flex-1 space-y-1.5 text-left">
              <h3 className="text-sm font-semibold leading-none tracking-tight text-foreground">{title}</h3>
              {helperText != null ? <p className="text-xs text-muted-foreground/80">{helperText}</p> : null}
            </div>
          </button>
        </CollapsibleTrigger>
      )}
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  )
}

type DashboardCollapsiblePanelProps = {
  isMd: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  panelTitle: ReactNode
  badge: ReactNode
  children: ReactNode
  /** Full Tailwind gradient classes including `bg-gradient-to-r` (static string for JIT). */
  gradientClassName?: string
}

/** Panel title lives inside the card; mobile uses a trigger row inside the header (no duplicate heading outside the panel). */
function DashboardCollapsiblePanel({
  isMd,
  open,
  onOpenChange,
  panelTitle,
  badge,
  children,
  gradientClassName,
}: DashboardCollapsiblePanelProps) {
  const expanded = isMd || open
  return (
    <Collapsible
      open={expanded}
      onOpenChange={(v) => {
        if (!isMd) onOpenChange(v)
      }}
      className="w-full"
    >
      <Panel className="w-full overflow-hidden border-0 shadow-md">
        {gradientClassName ? <div className={`h-1 ${gradientClassName}`} /> : null}
        <PanelHeader className="items-center pb-2">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {isMd ? (
              <>
                <PanelTitle className="text-base">{panelTitle}</PanelTitle>
                {badge}
              </>
            ) : (
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 rounded-md py-1 text-left outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring sm:items-center"
                >
                  <ChevronDown
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                      expanded && "rotate-180"
                    )}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <PanelTitle className="text-base text-left">{panelTitle}</PanelTitle>
                    {badge}
                  </div>
                </button>
              </CollapsibleTrigger>
            )}
          </div>
        </PanelHeader>
        <CollapsibleContent>
          <PanelContent>{children}</PanelContent>
        </CollapsibleContent>
      </Panel>
    </Collapsible>
  )
}

export default function DashboardOverview({
  returnTo = "/dashboard",
  title = "Assembled Media Overview",
  showMetrics = true,
  showTables = true,
}: DashboardOverviewProps) {
  const { user, isLoading, error: authError, userRole, userClient, isClient } = useAuthContext()
  const router = useRouter()
  const pathname = usePathname()
  const [mediaPlans, setMediaPlans] = useState<MediaPlan[]>([])
  const [scopes, setScopes] = useState<ScopeOfWork[]>([])
  const [monthlyPublisherSpend, setMonthlyPublisherSpend] = useState<Array<{ month: string; data: Array<{ publisher: string; amount: number }> }>>([])
  const [monthlyClientSpend, setMonthlyClientSpend] = useState<Array<{ month: string; data: Array<{ client: string; amount: number }> }>>([])
  /** `mp_client_name` → `brand_colour` from Xano (see `getGlobalMonthlyClientSpend`). */
  const [clientProfileColors, setClientProfileColors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [fetchError, setFetchError] = useState<DashboardErrorCopy | null>(null)
  const [dataLastRefreshedAt, setDataLastRefreshedAt] = useState<Date | null>(null)
  const [publisherSpendData, setPublisherSpendData] = useState<Array<{ name: string; value: number; percentage: number }>>([])
  const [clientSpendData, setClientSpendData] = useState<Array<{ name: string; value: number; percentage: number }>>([])
  const [liveCampaignSort, setLiveCampaignSort] = useState<SortState>({ column: "", direction: null })
  const [liveScopesSort, setLiveScopesSort] = useState<SortState>({ column: "", direction: null })
  const [dueSoonSort, setDueSoonSort] = useState<SortState>({ column: "", direction: null })
  const [finishedSort, setFinishedSort] = useState<SortState>({ column: "", direction: null })
  const { mode: listGridMode, setMode: setListGridMode } = useListGridLayoutPreference()
  const [dashboardFilters, setDashboardFilters] = useState<DashboardViewFilters>(defaultDashboardViewFilters)
  const debouncedCampaignSearch = useDebouncedValue(dashboardFilters.campaignSearch, 350)
  const [savedViewLoaded, setSavedViewLoaded] = useState(false)
  const [savedViewJustSaved, setSavedViewJustSaved] = useState(false)
  const [savedViews, setSavedViews] = useState<SavedDashboardViewRecord[]>([])
  const [baselineTemplateId, setBaselineTemplateId] = useState<string | null>(executiveOverviewTemplate.id)
  const [appliedSavedViewId, setAppliedSavedViewId] = useState<string | null>(null)
  const isMd = useIsMd()
  const [layoutPanels, setLayoutPanels] = useState<DashboardTemplatePanels>(() => ({
    ...executiveOverviewTemplate.panels,
  }))
  const [selectedTemplateId, setSelectedTemplateId] = useState(executiveOverviewTemplate.id)
  const [timeRangeDescription, setTimeRangeDescription] = useState(() =>
    describeDashboardTimeRange(executiveOverviewTemplate.timeRange),
  )
  const [openMonthlyCharts, setOpenMonthlyCharts] = useState(executiveOverviewTemplate.mobileOpen.monthlyTrends)
  const [openScopesPanel, setOpenScopesPanel] = useState(executiveOverviewTemplate.mobileOpen.scopes)
  const [openDueSoonPanel, setOpenDueSoonPanel] = useState(executiveOverviewTemplate.mobileOpen.dueSoon)
  const [openFinishedPanel, setOpenFinishedPanel] = useState(executiveOverviewTemplate.mobileOpen.finishedRecently)

  const getNextDirection = (current: SortDirection) => (current === "asc" ? "desc" : current === "desc" ? null : "asc")

  const toggleSort = (column: string, sort: SortState, setSort: React.Dispatch<React.SetStateAction<SortState>>) => {
    setSort((prev) => {
      const direction = prev.column === column ? getNextDirection(prev.direction) : "asc"
      return { column, direction }
    })
  }

  const applySort = useCallback(
    <T,>(
      data: T[],
      sortState: SortState,
      selectors: Record<string, (item: T) => SortableValue>,
    ): T[] => {
      const { column, direction } = sortState
      if (!direction || !selectors[column]) return data
      const select = selectors[column]
      return [...data].sort((a, b) =>
        compareValues(select(a), select(b), direction as Exclude<SortDirection, null>),
      )
    },
    [],
  )

  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetricCard[]>([
    {
      title: "Total Live Campaigns",
      value: "0",
      icon: BarChart3,
      tooltip: "Campaigns booked/approved/completed running today",
      color: "bg-blue-500",
      gradient: "from-blue-500 via-blue-500/70 to-blue-500/40",
      iconBg: "bg-blue-500/10",
      iconText: "text-blue-500",
    },
    {
      title: "Total Live Scopes of Work",
      value: "0",
      icon: TrendingUp,
      tooltip: "Sum of scopes with status Approved or In-Progress",
      color: "bg-green-500",
      gradient: "from-green-500 via-green-500/70 to-green-500/40",
      iconBg: "bg-green-500/10",
      iconText: "text-green-500",
    },
    {
      title: "Total Live Clients",
      value: "0",
      icon: Users,
      tooltip: "Sum of unique clients with live activity from campaigns and scopes",
      color: "bg-purple-500",
      gradient: "from-purple-500 via-purple-500/70 to-purple-500/40",
      iconBg: "bg-purple-500/10",
      iconText: "text-purple-500",
    },
    {
      title: "Total Live Publishers",
      value: "0",
      icon: ShoppingCart,
      tooltip: "Sum of unique publishers with live activity from campaigns",
      color: "bg-amber-500",
      gradient: "from-amber-500 via-amber-500/70 to-amber-500/40",
      iconBg: "bg-amber-500/10",
      iconText: "text-amber-500",
    },
  ])

  useEffect(() => {
    setMounted(true)
  }, [])

  const dashboardStorageUserId = useMemo(() => {
    if (!user) return null
    const anyUser = user as any
    const id = (anyUser?.sub || anyUser?.email || anyUser?.name || "").toString().trim()
    return id || null
  }, [user])

  const legacyPinnedClientsKey = dashboardStorageUserId
    ? `dashboard:view:v1:${dashboardStorageUserId}:clientFilters`
    : null
  const savedViewsListKey = dashboardStorageUserId
    ? `dashboard:savedViews:v2:${dashboardStorageUserId}`
    : null
  const lastTemplateStorageKey = dashboardStorageUserId
    ? `dashboard:lastTemplate:v1:${dashboardStorageUserId}`
    : null

  const persistPinnedClients = useCallback(
    (clients: string[]) => {
      if (!legacyPinnedClientsKey) return
      try {
        if (clients.length === 0) window.localStorage.removeItem(legacyPinnedClientsKey)
        else window.localStorage.setItem(legacyPinnedClientsKey, JSON.stringify(clients))
      } catch {
        // ignore
      }
    },
    [legacyPinnedClientsKey],
  )

  const writeSavedViewsToStorage = useCallback(
    (views: SavedDashboardViewRecord[]) => {
      if (!savedViewsListKey) return
      try {
        window.localStorage.setItem(savedViewsListKey, serializeSavedViewsToStorageJson(views))
      } catch {
        // ignore
      }
    },
    [savedViewsListKey],
  )

  const filtersHydratedRef = useRef(false)
  const urlSyncReadyRef = useRef(false)

  useEffect(() => {
    if (!mounted) return
    if (filtersHydratedRef.current) return
    filtersHydratedRef.current = true

    const sp = new URLSearchParams(window.location.search)
    const fromUrl = parseDashboardFiltersFromSearchParams(sp)
    const urlHasFilters = searchParamsHasAnyDashboardFilters(sp)
    const urlHasClientParams = sp.getAll("client").length > 0

    let loadedViews: SavedDashboardViewRecord[] = []
    if (savedViewsListKey) {
      try {
        loadedViews = parseSavedViewsFromStorageJson(window.localStorage.getItem(savedViewsListKey))
        if (loadedViews.length === 0 && legacyPinnedClientsKey) {
          const legacyRaw = window.localStorage.getItem(legacyPinnedClientsKey)
          if (legacyRaw) {
            try {
              const parsed = JSON.parse(legacyRaw)
              const values = Array.isArray(parsed) ? parsed.map((v) => (typeof v === "string" ? v : "")).filter(Boolean) : []
              if (values.length > 0) {
                loadedViews = [
                  {
                    id: crypto.randomUUID(),
                    name: "Saved clients",
                    filters: { ...defaultDashboardViewFilters(), clients: values },
                    templateId: executiveOverviewTemplate.id,
                    panels: { ...executiveOverviewTemplate.panels },
                    mobileOpen: { ...executiveOverviewTemplate.mobileOpen },
                    createdAt: new Date().toISOString(),
                  },
                ]
                window.localStorage.setItem(savedViewsListKey, serializeSavedViewsToStorageJson(loadedViews))
                window.localStorage.removeItem(legacyPinnedClientsKey)
              }
            } catch {
              // ignore invalid legacy payload
            }
          }
        }
      } catch {
        loadedViews = []
      }
    }
    setSavedViews(loadedViews)

    let nextFilters: DashboardViewFilters = fromUrl
    let nextTemplateId = executiveOverviewTemplate.id

    if (lastTemplateStorageKey) {
      try {
        const raw = window.localStorage.getItem(lastTemplateStorageKey)
        if (raw) {
          const id = raw.replace(/^"|"$/g, "").trim()
          if (id && getDashboardTemplateById(id)) nextTemplateId = id
        }
      } catch {
        // ignore
      }
    }

    if (urlHasFilters) {
      setBaselineTemplateId(null)
      if (lastTemplateStorageKey) {
        try {
          const raw = window.localStorage.getItem(lastTemplateStorageKey)
          const id = raw ? raw.replace(/^"|"$/g, "").trim() : ""
          const template = id ? getDashboardTemplateById(id) : undefined
          if (template) {
            setSelectedTemplateId(template.id)
            setLayoutPanels({ ...template.panels })
            setOpenMonthlyCharts(template.mobileOpen.monthlyTrends)
            setOpenScopesPanel(template.mobileOpen.scopes)
            setOpenDueSoonPanel(template.mobileOpen.dueSoon)
            setOpenFinishedPanel(template.mobileOpen.finishedRecently)
            setTimeRangeDescription(describeDashboardTimeRange(template.timeRange))
          }
        } catch {
          // ignore
        }
      }
    } else {
      const template = getDashboardTemplateById(nextTemplateId) ?? executiveOverviewTemplate
      nextFilters = buildFiltersForTemplate(template)
      let clients = nextFilters.clients
      if (!urlHasClientParams && legacyPinnedClientsKey) {
        try {
          const raw = window.localStorage.getItem(legacyPinnedClientsKey)
          if (raw) {
            const parsed = JSON.parse(raw)
            const values = Array.isArray(parsed) ? parsed.map((v) => (typeof v === "string" ? v : "")).filter(Boolean) : []
            if (values.length > 0) clients = values
          }
        } catch {
          // ignore
        }
      }
      nextFilters = { ...nextFilters, clients }

      setSelectedTemplateId(template.id)
      setLayoutPanels({ ...template.panels })
      setOpenMonthlyCharts(template.mobileOpen.monthlyTrends)
      setOpenScopesPanel(template.mobileOpen.scopes)
      setOpenDueSoonPanel(template.mobileOpen.dueSoon)
      setOpenFinishedPanel(template.mobileOpen.finishedRecently)
      setTimeRangeDescription(describeDashboardTimeRange(template.timeRange))
      setBaselineTemplateId(template.id)
    }

    setDashboardFilters(urlHasFilters ? fromUrl : nextFilters)

    setSavedViewLoaded(true)
    queueMicrotask(() => {
      urlSyncReadyRef.current = true
    })
  }, [
    mounted,
    user,
    savedViewsListKey,
    legacyPinnedClientsKey,
    lastTemplateStorageKey,
  ])

  useEffect(() => {
    if (!mounted) return
    const onPopState = () => {
      const sp = new URLSearchParams(window.location.search)
      setDashboardFilters(parseDashboardFiltersFromSearchParams(sp))
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [mounted])

  useEffect(() => {
    if (!mounted || !savedViewLoaded) return
    if (!urlSyncReadyRef.current) return

    const params = buildDashboardFiltersSearchParams(
      debouncedCampaignSearch,
      dashboardFilters.clients,
      dashboardFilters.publishers,
      dashboardFilters.month,
    )
    const qs = params.toString()
    const nextSearch = qs ? `?${qs}` : ""
    if (window.location.search === nextSearch) return

    router.replace(`${pathname}${nextSearch}`, { scroll: false })
  }, [
    mounted,
    savedViewLoaded,
    pathname,
    router,
    dashboardFilters.clients,
    dashboardFilters.publishers,
    dashboardFilters.month,
    debouncedCampaignSearch,
  ])

  const persistLastTemplateId = useCallback(
    (templateId: string) => {
      if (!lastTemplateStorageKey) return
      try {
        window.localStorage.setItem(lastTemplateStorageKey, templateId)
      } catch {
        // ignore
      }
    },
    [lastTemplateStorageKey],
  )

  const handleClearDashboardFilters = useCallback(() => {
    setDashboardFilters(defaultDashboardViewFilters())
    persistPinnedClients([])
    setBaselineTemplateId(null)
    setAppliedSavedViewId(null)
  }, [persistPinnedClients])

  const handleDashboardTemplateChange = useCallback(
    (templateId: string) => {
      setAppliedSavedViewId(null)
      applyTemplateToDashboardUi(templateId, {
        setSelectedTemplateId,
        setLayoutPanels,
        setOpenMonthlyCharts,
        setOpenScopesPanel,
        setOpenDueSoonPanel,
        setOpenFinishedPanel,
        setTimeRangeDescription,
        setDashboardFilters,
        setBaselineTemplateId,
      })
      const template = getDashboardTemplateById(templateId)
      if (template) {
        persistLastTemplateId(template.id)
        persistPinnedClients(buildFiltersForTemplate(template).clients)
      }
    },
    [persistLastTemplateId, persistPinnedClients],
  )

  const handleResetToTemplate = useCallback(() => {
    if (!baselineTemplateId) return
    const template = getDashboardTemplateById(baselineTemplateId)
    if (!template) return
    setAppliedSavedViewId(null)
    applyTemplateToDashboardUi(template.id, {
      setSelectedTemplateId,
      setLayoutPanels,
      setOpenMonthlyCharts,
      setOpenScopesPanel,
      setOpenDueSoonPanel,
      setOpenFinishedPanel,
      setTimeRangeDescription,
      setDashboardFilters,
      setBaselineTemplateId,
    })
    persistPinnedClients(buildFiltersForTemplate(template).clients)
    persistLastTemplateId(template.id)
  }, [baselineTemplateId, persistLastTemplateId, persistPinnedClients])

  const handleApplySavedView = useCallback(
    (savedId: string) => {
      const record = savedViews.find((s) => s.id === savedId)
      if (!record) return
      setAppliedSavedViewId(savedId)
      setBaselineTemplateId(null)
      setSelectedTemplateId(record.templateId)
      setLayoutPanels({ ...record.panels })
      setOpenMonthlyCharts(record.mobileOpen.monthlyTrends)
      setOpenScopesPanel(record.mobileOpen.scopes)
      setOpenDueSoonPanel(record.mobileOpen.dueSoon)
      setOpenFinishedPanel(record.mobileOpen.finishedRecently)
      const t = getDashboardTemplateById(record.templateId)
      setTimeRangeDescription(describeDashboardTimeRange(t?.timeRange ?? executiveOverviewTemplate.timeRange))
      setDashboardFilters(cloneDashboardViewFilters(record.filters))
      persistPinnedClients(record.filters.clients)
      persistLastTemplateId(record.templateId)
    },
    [savedViews, persistLastTemplateId, persistPinnedClients],
  )

  const saveDashboardViewAs = useCallback(
    (name: string) => {
      if (!savedViewsListKey) return
      const resolvedName = name.trim() || `View ${format(new Date(), "d MMM yyyy, h:mm a")}`
      const next: SavedDashboardViewRecord = {
        id: crypto.randomUUID(),
        name: resolvedName,
        filters: cloneDashboardViewFilters(dashboardFilters),
        templateId: selectedTemplateId,
        panels: { ...layoutPanels },
        mobileOpen: {
          monthlyTrends: openMonthlyCharts,
          scopes: openScopesPanel,
          dueSoon: openDueSoonPanel,
          finishedRecently: openFinishedPanel,
        },
        createdAt: new Date().toISOString(),
      }
      const views = [...savedViews, next]
      setSavedViews(views)
      writeSavedViewsToStorage(views)
      persistPinnedClients(next.filters.clients)
      setSavedViewJustSaved(true)
      window.setTimeout(() => setSavedViewJustSaved(false), 1500)
    },
    [
      savedViewsListKey,
      dashboardFilters,
      selectedTemplateId,
      layoutPanels,
      openMonthlyCharts,
      openScopesPanel,
      openDueSoonPanel,
      openFinishedPanel,
      savedViews,
      writeSavedViewsToStorage,
      persistPinnedClients,
    ],
  )

  const handleSaveSelectedClients = useCallback(() => {
    persistPinnedClients(dashboardFilters.clients)
    setSavedViewJustSaved(true)
    window.setTimeout(() => setSavedViewJustSaved(false), 1500)
  }, [dashboardFilters.clients, persistPinnedClients])

  const handleClearAllSavedViews = useCallback(() => {
    if (!savedViewsListKey) return
    try {
      window.localStorage.removeItem(savedViewsListKey)
    } catch {
      // ignore
    }
    if (legacyPinnedClientsKey) {
      try {
        window.localStorage.removeItem(legacyPinnedClientsKey)
      } catch {
        // ignore
      }
    }
    setSavedViews([])
    setAppliedSavedViewId(null)
    setSavedViewJustSaved(false)
  }, [savedViewsListKey, legacyPinnedClientsKey])

  useEffect(() => {
    if (!appliedSavedViewId) return
    const sv = savedViews.find((s) => s.id === appliedSavedViewId)
    if (!sv || !dashboardViewFiltersEqual(sv.filters, dashboardFilters)) {
      setAppliedSavedViewId(null)
    }
  }, [appliedSavedViewId, savedViews, dashboardFilters])

  const handleSpendPublisherPieClick = useCallback((payload: ChartDatumClickPayload) => {
    if (payload.chart !== "pie") return
    const name = payload.name?.trim()
    if (!name) return
    const params = new URLSearchParams()
    params.set("publisher", name)
    router.push(`/publishers?${params.toString()}`)
  }, [router])

  const handleSpendClientPieClick = useCallback((payload: ChartDatumClickPayload) => {
    if (payload.chart !== "pie") return
    const name = payload.name?.trim()
    if (!name) return
    const key = normalizeClientFilterValue(name)
    if (!key) return
    setDashboardFilters((f) => ({ ...f, clients: [key], month: null }))
  }, [])

  const handleMonthlyClientChartClick = useCallback((payload: ChartDatumClickPayload) => {
    if (payload.chart !== "stackedColumn") return
    const name = payload.name?.trim()
    if (!name) return
    const key = normalizeClientFilterValue(name)
    if (!key) return
    if (payload.source === "legend") {
      setDashboardFilters((f) => ({ ...f, clients: [key], month: null }))
    } else {
      const month = payload.category?.trim() || null
      setDashboardFilters((f) => ({ ...f, clients: [key], month }))
    }
  }, [])

  const handleMonthlyPublisherChartClick = useCallback((payload: ChartDatumClickPayload) => {
    if (payload.chart !== "stackedColumn") return
    const name = payload.name?.trim()
    if (!name) return
    if (payload.source === "legend") {
      setDashboardFilters((f) => ({ ...f, publishers: [name], month: null }))
    } else {
      const month = payload.category?.trim() || null
      setDashboardFilters((f) => ({ ...f, publishers: [name], month }))
    }
  }, [])

  useEffect(() => {
    if (mounted && !isLoading && !user) {
      const loginReturn = encodeURIComponent(returnTo || "/dashboard")
      router.push(`/auth/login?returnTo=${loginReturn}`)
    }
  }, [mounted, isLoading, user, router, returnTo])

  useEffect(() => {
    if (mounted && !isLoading && user && isClient) {
      if (userClient) {
        router.replace(`/dashboard/${userClient}`)
      } else {
        router.replace("/unauthorized")
      }
    }
  }, [mounted, isLoading, user, isClient, userClient, router])

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setFetchError(null)

      try {
        const [monthlyPubResp, monthlyClientResp] = await Promise.all([
          fetch("/api/dashboard/global-monthly-publisher-spend"),
          fetch("/api/dashboard/global-monthly-client-spend"),
        ])

        const monthlyPub = monthlyPubResp.ok ? await monthlyPubResp.json() : []
        const monthlyClient = monthlyClientResp.ok ? await monthlyClientResp.json() : null

        setMonthlyPublisherSpend(Array.isArray(monthlyPub) ? monthlyPub : [])
        setMonthlyClientSpend(
          monthlyClient && typeof monthlyClient === "object" && Array.isArray(monthlyClient.data)
            ? monthlyClient.data
            : [],
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
      } catch (error) {
        console.error("Dashboard: Error fetching monthly breakdowns:", error)
        setMonthlyPublisherSpend([])
        setMonthlyClientSpend([])
        setClientProfileColors({})
      }

      const mediaPlansResponse = await fetch("/api/media_plans").catch((err) => {
        console.error("Dashboard: Error fetching media plans:", err)
        throw new Error("Failed to fetch media plans")
      })

      if (!mediaPlansResponse.ok) {
        const errorText = await mediaPlansResponse.text()
        console.error("Dashboard: Media plans API error:", mediaPlansResponse.status, errorText)
        throw new Error(`Failed to fetch media plans: ${mediaPlansResponse.status}`)
      }

      const mediaPlansRaw = await mediaPlansResponse.json()
      const mediaPlansData = transformMediaPlanData(Array.isArray(mediaPlansRaw) ? mediaPlansRaw : [])

      let scopesData: ScopeOfWork[] = []
      if (showTables || showMetrics) {
        const scopesResponse = await fetch("/api/scopes-of-work").catch((err) => {
          console.error("Dashboard: Error fetching scopes:", err)
          return { ok: false, json: async () => [] }
        })

        if (scopesResponse.ok) {
          const scopesRaw = await scopesResponse.json()
          scopesData = Array.isArray(scopesRaw) ? scopesRaw : []
        }
      }

      setMediaPlans(mediaPlansData)
      setScopes(scopesData)

      const statusFilteredPlans = getHighestBookedApprovedCompletedVersionPerMba(mediaPlansData)

      const { startOfToday, endOfToday } = getTodayBounds()
      const liveCampaigns = statusFilteredPlans.filter((plan) => {
        const startDate = new Date(plan.mp_campaigndates_start)
        const endDate = new Date(plan.mp_campaigndates_end)
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return false
        return startDate <= endOfToday && endDate >= startOfToday
      })

      const liveScopes = scopesData.filter((scope) => scope.project_status === "Approved" || scope.project_status === "In-Progress")

      const liveClients = new Set<string>()
      liveCampaigns.forEach((campaign) => {
        if (campaign.mp_clientname) liveClients.add(campaign.mp_clientname)
      })
      liveScopes.forEach((scope) => {
        if (scope.client_name) liveClients.add(scope.client_name)
      })

      const totalLiveCampaigns = liveCampaigns.length
      const totalLiveScopes = liveScopes.length
      const totalLiveClients = liveClients.size

      const { startDate: fyStartDate, endDate: fyEndDate } = getCurrentFinancialYear()
      const eligibleCampaignsInFY = statusFilteredPlans.filter((plan) => {
        const planStartDate = new Date(plan.mp_campaigndates_start)
        const planEndDate = new Date(plan.mp_campaigndates_end)
        return planStartDate <= fyEndDate && planEndDate >= fyStartDate
      })

      const allPublishersSet = new Set<string>()
      for (const campaign of liveCampaigns) {
        const schedule = campaign.deliverySchedule ?? campaign.billingSchedule
        if (schedule) {
          const publishers = extractPublishersFromSchedule(schedule)
          publishers.forEach((publisher) => allPublishersSet.add(publisher))
        }
      }
      const totalLivePublishers = allPublishersSet.size

      const publisherSpend: Record<string, number> = {}
      const clientSpend: Record<string, number> = {}

      for (const campaign of eligibleCampaignsInFY) {
        const schedule = campaign.deliverySchedule ?? campaign.billingSchedule
        if (schedule) {
          try {
            const { publisherSpend: campaignPublisherSpend, totalSpend: campaignTotalSpend } = extractSpendFromSchedule(schedule, fyStartDate, fyEndDate)

            Object.entries(campaignPublisherSpend).forEach(([publisher, amount]) => {
              publisherSpend[publisher] = (publisherSpend[publisher] || 0) + amount
            })

            if (campaign.mp_clientname && campaignTotalSpend > 0) {
              clientSpend[campaign.mp_clientname] = (clientSpend[campaign.mp_clientname] || 0) + campaignTotalSpend
            }
          } catch (error) {
            console.error(`Error processing billing schedule for campaign ${campaign.mp_mba_number}:`, error)
          }
        }
      }

      const publisherSpendArray = Object.entries(publisherSpend)
        .map(([name, value]) => ({ name, value: Math.round(value), percentage: 0 }))
        .filter((item) => item.value > 0)
        .sort((a, b) => b.value - a.value)

      const totalPublisherSpend = publisherSpendArray.reduce((sum, item) => sum + item.value, 0)
      publisherSpendArray.forEach((item) => {
        item.percentage = totalPublisherSpend > 0 ? (item.value / totalPublisherSpend) * 100 : 0
      })

      const clientSpendArray = Object.entries(clientSpend)
        .map(([name, value]) => ({ name, value: Math.round(value), percentage: 0 }))
        .filter((item) => item.value > 0)
        .sort((a, b) => b.value - a.value)

      const totalClientSpend = clientSpendArray.reduce((sum, item) => sum + item.value, 0)
      clientSpendArray.forEach((item) => {
        item.percentage = totalClientSpend > 0 ? (item.value / totalClientSpend) * 100 : 0
      })

      setPublisherSpendData(publisherSpendArray)
      setClientSpendData(clientSpendArray)

      setDashboardMetrics([
        {
          title: "Total Live Campaigns",
          value: totalLiveCampaigns.toString(),
          icon: BarChart3,
          tooltip: "Campaigns booked/approved/completed running today",
          color: "bg-blue-500",
          gradient: "from-blue-500 via-blue-500/70 to-blue-500/40",
          iconBg: "bg-blue-500/10",
          iconText: "text-blue-500",
        },
        {
          title: "Total Live Scopes of Work",
          value: totalLiveScopes.toString(),
          icon: TrendingUp,
          tooltip: "Sum of scopes with status Approved or In-Progress",
          color: "bg-green-500",
          gradient: "from-green-500 via-green-500/70 to-green-500/40",
          iconBg: "bg-green-500/10",
          iconText: "text-green-500",
        },
        {
          title: "Total Live Clients",
          value: totalLiveClients.toString(),
          icon: Users,
          tooltip: "Unique clients with live campaigns or scopes",
          color: "bg-purple-500",
          gradient: "from-purple-500 via-purple-500/70 to-purple-500/40",
          iconBg: "bg-purple-500/10",
          iconText: "text-purple-500",
        },
        {
          title: "Total Live Publishers",
          value: totalLivePublishers.toString(),
          icon: ShoppingCart,
          tooltip: "Unique publishers appearing on live campaigns",
          color: "bg-amber-500",
          gradient: "from-amber-500 via-amber-500/70 to-amber-500/40",
          iconBg: "bg-amber-500/10",
          iconText: "text-amber-500",
        },
      ])
      setDataLastRefreshedAt(new Date())
    } catch (error) {
      console.error("Dashboard: Error fetching data:", error)
      setFetchError(toDashboardFetchError(error))
    } finally {
      setLoading(false)
    }
  }, [showMetrics, showTables])

  useEffect(() => {
    if (mounted && user && !isClient) {
      fetchData()
    }
    if (mounted && user && isClient) {
      setLoading(false)
    }
  }, [mounted, user, isClient, fetchData])

  const getEnabledMediaTypes = useCallback((plan: MediaPlan): string[] => {
    const entries: Array<[string, boolean]> = [
      ["television", Boolean(plan.mp_television)],
      ["radio", Boolean(plan.mp_radio)],
      ["newspaper", Boolean(plan.mp_newspaper)],
      ["magazines", Boolean(plan.mp_magazines)],
      ["ooh", Boolean(plan.mp_ooh)],
      ["cinema", Boolean(plan.mp_cinema)],
      ["digidisplay", Boolean(plan.mp_digidisplay)],
      ["digiaudio", Boolean(plan.mp_digiaudio)],
      ["digivideo", Boolean(plan.mp_digivideo)],
      ["bvod", Boolean(plan.mp_bvod)],
      ["integration", Boolean(plan.mp_integration)],
      ["search", Boolean(plan.mp_search)],
      ["socialmedia", Boolean(plan.mp_socialmedia)],
      ["progdisplay", Boolean(plan.mp_progdisplay)],
      ["progvideo", Boolean(plan.mp_progvideo)],
      ["progbvod", Boolean(plan.mp_progbvod)],
      ["progaudio", Boolean(plan.mp_progaudio)],
      ["progooh", Boolean(plan.mp_progooh)],
      ["influencers", Boolean(plan.mp_influencers)],
    ]
    return entries.filter(([, enabled]) => enabled).map(([key]) => key)
  }, [])

  const getPageContext = useCallback((): PageContext => {
    const latestPlans = getLatestPlanVersions(mediaPlans)

    const buildClientFilterOptions = () => {
      const map = new Map<string, string>()
      for (const plan of latestPlans) {
        const label = (plan.mp_clientname || "").toString().trim()
        if (!label) continue
        const key = normalizeClientFilterValue(label)
        if (!key) continue
        if (!map.has(key)) map.set(key, label)
      }
      return Array.from(map.entries())
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([value, label]) => ({ value, label }))
    }

    const clientFilterOptions = buildClientFilterOptions()

    const getLiveCampaigns = () => {
      const { startOfToday, endOfToday } = getTodayBounds()
      return getHighestBookedApprovedCompletedVersionPerMba(mediaPlans).filter((plan) => {
        const startDate = new Date(plan.mp_campaigndates_start)
        const endDate = new Date(plan.mp_campaigndates_end)
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return false
        return startDate <= endOfToday && endDate >= startOfToday
      })
    }

    const getCampaignsDueToStart = () => {
      const { startOfToday, endOfToday } = getTodayBounds()
      const tenDaysAhead = new Date(endOfToday)
      tenDaysAhead.setDate(endOfToday.getDate() + 10)
      return latestPlans.filter((plan) => {
        const startDate = new Date(plan.mp_campaigndates_start)
        if (isNaN(startDate.getTime())) return false
        return startDate >= startOfToday && startDate <= tenDaysAhead
      })
    }

    const getCampaignsFinishedRecently = () => {
      const { endOfToday } = getTodayBounds()
      const fortyDaysAgo = new Date(endOfToday)
      fortyDaysAgo.setDate(endOfToday.getDate() - 40)
      return getHighestBookedApprovedCompletedVersionPerMba(mediaPlans).filter((plan) => {
        const endDate = new Date(plan.mp_campaigndates_end)
        if (isNaN(endDate.getTime())) return false
        return endDate >= fortyDaysAgo && endDate <= endOfToday
      })
    }

    const getLiveScopes = () =>
      scopes.filter((scope) => scope.project_status === "Approved" || scope.project_status === "In-Progress")

    const safeDate = (value: string) => {
      const d = new Date(value)
      return isNaN(d.getTime()) ? new Date(0) : d
    }

    const liveCampaignSelectors = {
      client: (plan: MediaPlan) => plan.mp_clientname || "",
      campaign: (plan: MediaPlan) => plan.mp_campaignname || "",
      mba: (plan: MediaPlan) => plan.mp_mba_number || "",
      startDate: (plan: MediaPlan) => safeDate(plan.mp_campaigndates_start),
      endDate: (plan: MediaPlan) => safeDate(plan.mp_campaigndates_end),
      budget: (plan: MediaPlan) => plan.mp_campaignbudget || 0,
      version: (plan: MediaPlan) => plan.mp_version || 0,
      status: (plan: MediaPlan) => plan.mp_campaignstatus || "",
    }

    const scopeSelectors = {
      project: (scope: ScopeOfWork) => scope.project_name || "",
      client: (scope: ScopeOfWork) => scope.client_name || "",
      scopeDate: (scope: ScopeOfWork) => safeDate(scope.scope_date),
      status: (scope: ScopeOfWork) => scope.project_status || "",
    }

    const liveCampaigns = showTables ? applyDashboardTableFiltersToPlans(getLiveCampaigns(), dashboardFilters) : []
    const liveScopes = showTables ? applyDashboardTableFiltersToScopes(getLiveScopes(), dashboardFilters) : []
    const campaignsDueToStart = showTables ? applyDashboardTableFiltersToPlans(getCampaignsDueToStart(), dashboardFilters) : []
    const campaignsFinishedRecently = showTables
      ? applyDashboardTableFiltersToPlans(getCampaignsFinishedRecently(), dashboardFilters)
      : []

    const sortedLiveCampaigns = applySort(liveCampaigns, liveCampaignSort, liveCampaignSelectors)
    const sortedLiveScopes = applySort(liveScopes, liveScopesSort, scopeSelectors)
    const sortedDueSoon = applySort(campaignsDueToStart, dueSoonSort, liveCampaignSelectors)
    const sortedFinished = applySort(campaignsFinishedRecently, finishedSort, liveCampaignSelectors)

    const previewCampaign = (plan: MediaPlan) => ({
      clientName: plan.mp_clientname,
      campaignName: plan.mp_campaignname,
      mbaNumber: plan.mp_mba_number,
      version: plan.mp_version,
      status: plan.mp_campaignstatus,
      startDate: plan.mp_campaigndates_start,
      endDate: plan.mp_campaigndates_end,
      budget: plan.mp_campaignbudget,
      mediaTypes: getEnabledMediaTypes(plan),
    })

    const previewScope = (scope: ScopeOfWork) => ({
      projectName: scope.project_name,
      clientName: scope.client_name,
      scopeDate: scope.scope_date,
      status: scope.project_status,
    })

    const fields: PageField[] = [
      {
        id: "dashboard_campaignSearch",
        label: "Campaign search",
        type: "string",
        value: dashboardFilters.campaignSearch,
        editable: true,
        semanticType: "search_query",
        group: "filters",
        source: "ui",
      },
      {
        id: "dashboard_campaignClientFilters",
        label: "Client filters",
        type: "string[]",
        value: dashboardFilters.clients,
        editable: true,
        semanticType: "client_filter",
        group: "filters",
        source: "ui",
        options: clientFilterOptions.map((o) => o.label),
      },
      {
        id: "dashboard_sort_liveCampaigns",
        label: "Sort: Live Campaigns",
        type: "sort_state",
        value: liveCampaignSort,
        editable: true,
        semanticType: "sort",
        group: "sort",
        source: "ui",
      },
      {
        id: "dashboard_sort_liveScopes",
        label: "Sort: Live Scopes",
        type: "sort_state",
        value: liveScopesSort,
        editable: true,
        semanticType: "sort",
        group: "sort",
        source: "ui",
      },
      {
        id: "dashboard_sort_dueSoon",
        label: "Sort: Campaigns Starting Soon",
        type: "sort_state",
        value: dueSoonSort,
        editable: true,
        semanticType: "sort",
        group: "sort",
        source: "ui",
      },
      {
        id: "dashboard_sort_finished",
        label: "Sort: Campaigns Finished Recently",
        type: "sort_state",
        value: finishedSort,
        editable: true,
        semanticType: "sort",
        group: "sort",
        source: "ui",
      },
      {
        id: "dashboard_action_openCampaign",
        label: "Open a campaign in dashboard (set MBA number)",
        type: "action",
        value: "",
        editable: true,
        semanticType: "navigation",
        group: "actions",
        source: "ui",
      },
      {
        id: "dashboard_action_openEdit",
        label: "Open media plan edit (set MBA number, optionally version)",
        type: "action",
        value: "",
        editable: true,
        semanticType: "navigation",
        group: "actions",
        source: "ui",
      },
      {
        id: "dashboard_action_saveView",
        label: "Save current dashboard as a new named view in localStorage (set true)",
        type: "action",
        value: false,
        editable: true,
        semanticType: "action",
        group: "actions",
        source: "ui",
      },
      {
        id: "dashboard_action_clearSavedView",
        label: "Clear all saved views from this browser (set true)",
        type: "action",
        value: false,
        editable: true,
        semanticType: "action",
        group: "actions",
        source: "ui",
      },
      {
        id: "dashboard_action_clearFilters",
        label: "Clear chart and table filters (set true)",
        type: "action",
        value: false,
        editable: true,
        semanticType: "action",
        group: "actions",
        source: "ui",
      },
      {
        id: "dashboard_filters",
        label: "Full dashboard filters object",
        type: "object",
        value: dashboardFilters,
        editable: true,
        semanticType: "filters",
        group: "filters",
        source: "ui",
      },
    ]

    return {
      route: { pathname: pathname || "/dashboard" },
      fields,
      generatedAt: new Date().toISOString(),
      pageText: {
        title,
        headings: [title],
        breadcrumbs: ["Dashboard"],
      },
      state: {
        loading,
        error:
          fetchError
            ? `${fetchError.title} ${fetchError.detail}`
            : authError instanceof Error
              ? authError.message
              : authError
                ? String(authError)
                : null,
        filters: {
          dashboardFilters,
          availableClientFilters: clientFilterOptions.map((o) => o.label),
          savedViewsCount: savedViews.length,
          baselineTemplateId,
        },
        sort: {
          liveCampaignSort,
          liveScopesSort,
          dueSoonSort,
          finishedSort,
        },
        counts: {
          metrics: dashboardMetrics.map((m) => ({ title: m.title, value: m.value })),
          liveCampaigns: liveCampaigns.length,
          liveScopes: liveScopes.length,
          campaignsStartingSoon: campaignsDueToStart.length,
          campaignsFinishedRecently: campaignsFinishedRecently.length,
        },
        preview: {
          liveCampaigns: sortedLiveCampaigns.slice(0, 6).map(previewCampaign),
          liveScopes: sortedLiveScopes.slice(0, 6).map(previewScope),
          campaignsStartingSoon: sortedDueSoon.slice(0, 6).map(previewCampaign),
          campaignsFinishedRecently: sortedFinished.slice(0, 6).map(previewCampaign),
        },
      },
    }
  }, [
    applySort,
    authError,
    dashboardFilters,
    dashboardMetrics,
    dueSoonSort,
    fetchError,
    finishedSort,
    getEnabledMediaTypes,
    liveCampaignSort,
    liveScopesSort,
    loading,
    mediaPlans,
    pathname,
    baselineTemplateId,
    savedViews,
    scopes,
    showTables,
    title,
  ])

  const handleSetField = useCallback(
    async ({ fieldId, value }: { fieldId?: string; selector?: string; value: any }) => {
      const id = (fieldId || "").toString()

      const parseSortState = (input: any): SortState => {
        if (!input) return { column: "", direction: null }
        if (typeof input === "object" && !Array.isArray(input)) {
          const column = typeof input.column === "string" ? input.column : ""
          const direction: SortDirection =
            input.direction === "asc" || input.direction === "desc" || input.direction === null ? input.direction : null
          return { column, direction }
        }
        if (typeof input === "string") {
          const raw = input.trim()
          if (!raw) return { column: "", direction: null }
          const [column, dirRaw] = raw.split(/\s+/)
          const dir = (dirRaw || "").toLowerCase()
          const direction: SortDirection = dir === "asc" ? "asc" : dir === "desc" ? "desc" : null
          return { column, direction }
        }
        return { column: "", direction: null }
      }

      if (id === "dashboard_campaignSearch") {
        const next = typeof value === "string" ? value : value == null ? "" : String(value)
        setDashboardFilters((f) => ({ ...f, campaignSearch: next }))
        return "Updated dashboard campaign search."
      }

      if (id === "dashboard_campaignClientFilters") {
        const next = Array.isArray(value)
          ? value.map((v) => (typeof v === "string" ? v : String(v))).filter(Boolean)
          : typeof value === "string"
            ? [value].filter(Boolean)
            : []
        setDashboardFilters((f) => ({ ...f, clients: next }))
        return "Updated dashboard client filters."
      }

      if (id === "dashboard_action_clearFilters") {
        if (Boolean(value)) {
          setDashboardFilters(defaultDashboardViewFilters())
        }
        return "Cleared dashboard filters."
      }

      if (id === "dashboard_sort_liveCampaigns") {
        setLiveCampaignSort(parseSortState(value))
        return "Updated sort for Live Campaigns."
      }
      if (id === "dashboard_sort_liveScopes") {
        setLiveScopesSort(parseSortState(value))
        return "Updated sort for Live Scopes."
      }
      if (id === "dashboard_sort_dueSoon") {
        setDueSoonSort(parseSortState(value))
        return "Updated sort for Campaigns Starting Soon."
      }
      if (id === "dashboard_sort_finished") {
        setFinishedSort(parseSortState(value))
        return "Updated sort for Campaigns Finished Recently."
      }

      if (id === "dashboard_action_saveView") {
        if (Boolean(value)) {
          saveDashboardViewAs(`Saved ${format(new Date(), "d MMM yyyy, h:mm a")}`)
        }
        return "Saved dashboard view."
      }

      if (id === "dashboard_action_clearSavedView") {
        if (Boolean(value)) {
          handleClearAllSavedViews()
        }
        return "Cleared saved dashboard views."
      }

      if (id === "dashboard_filters") {
        if (value && typeof value === "object" && !Array.isArray(value)) {
          const v = value as Record<string, unknown>
          setDashboardFilters((prev) => ({
            campaignSearch:
              typeof v.campaignSearch === "string" ? v.campaignSearch : prev.campaignSearch,
            clients: Array.isArray(v.clients) ? v.clients.map((x) => String(x)).filter(Boolean) : prev.clients,
            publishers: Array.isArray(v.publishers) ? v.publishers.map((x) => String(x)).filter(Boolean) : prev.publishers,
            month:
              "month" in v
                ? typeof v.month === "string" && v.month.trim()
                  ? v.month.trim()
                  : null
                : prev.month,
          }))
          return "Updated dashboard filters."
        }
        throw new Error("dashboard_filters expects an object payload.")
      }

      if (id === "dashboard_action_openCampaign") {
        const mbaNumber =
          typeof value === "string"
            ? value.trim()
            : value && typeof value === "object" && typeof value.mbaNumber === "string"
              ? value.mbaNumber.trim()
              : value != null
                ? String(value).trim()
                : ""
        if (!mbaNumber) throw new Error("MBA number is required.")

        const latestPlans = getLatestPlanVersions(mediaPlans)
        const match = latestPlans.find((p) => String(p.mp_mba_number) === mbaNumber)
        const clientSlug =
          value && typeof value === "object" && typeof value.clientSlug === "string"
            ? value.clientSlug
            : match
              ? slugifyClientName(match.mp_clientname)
              : ""
        if (!clientSlug) throw new Error("Could not determine client slug for that MBA number.")
        router.push(`/dashboard/${encodeURIComponent(clientSlug)}/${encodeURIComponent(mbaNumber)}`)
        return `Opened dashboard for ${clientSlug} / MBA ${mbaNumber}.`
      }

      if (id === "dashboard_action_openEdit") {
        const mbaNumber =
          typeof value === "string"
            ? value.trim()
            : value && typeof value === "object" && typeof value.mbaNumber === "string"
              ? value.mbaNumber.trim()
              : value != null
                ? String(value).trim()
                : ""
        if (!mbaNumber) throw new Error("MBA number is required.")

        const latestPlans = getLatestPlanVersions(mediaPlans)
        const match = latestPlans.find((p) => String(p.mp_mba_number) === mbaNumber)
        const version =
          value && typeof value === "object" && (typeof value.version === "number" || typeof value.version === "string")
            ? value.version
            : match
              ? match.mp_version
              : undefined

        const versionQuery = version ? `?version=${encodeURIComponent(String(version))}` : ""
        router.push(`/mediaplans/mba/${encodeURIComponent(mbaNumber)}/edit${versionQuery}`)
        return `Opened media plan edit for MBA ${mbaNumber}${version ? ` (v${version})` : ""}.`
      }

      throw new Error(`Unsupported fieldId: ${id || "(missing)"}`)
    },
    [
      handleClearAllSavedViews,
      mediaPlans,
      router,
      saveDashboardViewAs,
      setDueSoonSort,
      setFinishedSort,
      setLiveCampaignSort,
      setLiveScopesSort,
    ]
  )

  useEffect(() => {
    if (!mounted || isLoading) return
    if (!user || isClient) return
    if (authError || fetchError) return

    setAssistantContext({
      pageContext: getPageContext(),
      actions: {
        setField: handleSetField,
      },
    })
  }, [authError, fetchError, getPageContext, handleSetField, isClient, isLoading, mounted, user])

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
      .map((key) => ({ key, label: key }))
  }, [monthlyPublisherStackedRows])

  const clientSpendSparklineTable = useMemo(() => {
    const rows = clientSpendData.slice(0, DASHBOARD_CLIENT_SPARKLINE_TOP_N)
    if (!monthlyClientSpend.length || rows.length === 0) {
      return { rows, showTrendColumn: false, seriesByName: {} as Record<string, number[] | null> }
    }
    const seriesByName: Record<string, number[] | null> = {}
    for (const row of rows) {
      seriesByName[row.name] = extractClientMonthlySeries(monthlyClientSpend, row.name)
    }
    const showTrendColumn = Object.values(seriesByName).some((s) => s != null)
    return { rows, showTrendColumn, seriesByName }
  }, [clientSpendData, monthlyClientSpend])

  if (!mounted || isLoading) {
    return <AuthPageLoading message="Loading dashboard..." />
  }

  if (user && isClient) {
    return <AuthPageLoading message="Redirecting to your dashboard..." />
  }

  if (authError) {
    const { title, detail } = authErrorCopy(authError)
    return (
      <DashboardPageErrorPanel title={title} detail={detail} onRetry={() => router.refresh()} />
    )
  }

  if (!user) {
    return null
  }

  const getLiveCampaigns = () => {
    const { startOfToday, endOfToday } = getTodayBounds()

    return getHighestBookedApprovedCompletedVersionPerMba(mediaPlans).filter((plan) => {
      const startDate = new Date(plan.mp_campaigndates_start)
      const endDate = new Date(plan.mp_campaigndates_end)
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return false

      return startDate <= endOfToday && endDate >= startOfToday
    })
  }

  const getLiveScopes = () => scopes.filter((scope) => scope.project_status === "Approved" || scope.project_status === "In-Progress")

  const getCampaignsDueToStart = () => {
    const { startOfToday, endOfToday } = getTodayBounds()
    const tenDaysAhead = new Date(endOfToday)
    tenDaysAhead.setDate(endOfToday.getDate() + 10)

    const latestPlans = getLatestPlanVersions(mediaPlans)

    return latestPlans.filter((plan) => {
      const startDate = new Date(plan.mp_campaigndates_start)
      if (isNaN(startDate.getTime())) return false

      return startDate >= startOfToday && startDate <= tenDaysAhead
    })
  }

  const getCampaignsFinishedRecently = () => {
    const { endOfToday } = getTodayBounds()
    const fortyDaysAgo = new Date(endOfToday)
    fortyDaysAgo.setDate(endOfToday.getDate() - 40)

    return getHighestBookedApprovedCompletedVersionPerMba(mediaPlans).filter((plan) => {
      const endDate = new Date(plan.mp_campaigndates_end)
      if (isNaN(endDate.getTime())) return false

      return endDate >= fortyDaysAgo && endDate <= endOfToday
    })
  }

  const safeDate = (value: string) => {
    const d = new Date(value)
    return isNaN(d.getTime()) ? new Date(0) : d
  }

  const getStatusBadgeColor = (status: string) => {
    if (!status) return "bg-gray-500/15 text-gray-600 border-0"
    switch (status.toLowerCase()) {
      case "booked":
        return "bg-purple-500/15 text-purple-700 border-0"
      case "approved":
        return "bg-green-500/15 text-green-700 border-0"
      case "planned":
        return "bg-blue-500/15 text-blue-700 border-0"
      case "draft":
        return "bg-gray-500/15 text-gray-600 border-0"
      case "completed":
        return "bg-teal-500/15 text-teal-700 border-0"
      case "cancelled":
        return "bg-red-500/15 text-red-700 border-0"
      case "in-progress":
        return "bg-purple-500/15 text-purple-700 border-0"
      default:
        return "bg-gray-500/15 text-gray-600 border-0"
    }
  }

  const getMediaTypeTags = (plan: MediaPlan) => {
    const isEnabled = (value: any): boolean => {
      if (typeof value === "boolean") return value === true
      if (typeof value === "string") return value.toLowerCase() === "true" || value === "1"
      if (typeof value === "number") return value === 1
      return false
    }

    const mediaTypes = [
      { key: "television", enabled: isEnabled(plan.mp_television) },
      { key: "radio", enabled: isEnabled(plan.mp_radio) },
      { key: "newspaper", enabled: isEnabled(plan.mp_newspaper) },
      { key: "magazines", enabled: isEnabled(plan.mp_magazines) },
      { key: "ooh", enabled: isEnabled(plan.mp_ooh) },
      { key: "cinema", enabled: isEnabled(plan.mp_cinema) },
      { key: "digidisplay", enabled: isEnabled(plan.mp_digidisplay) },
      { key: "digiaudio", enabled: isEnabled(plan.mp_digiaudio) },
      { key: "digivideo", enabled: isEnabled(plan.mp_digivideo) },
      { key: "bvod", enabled: isEnabled(plan.mp_bvod) },
      { key: "integration", enabled: isEnabled(plan.mp_integration) },
      { key: "search", enabled: isEnabled(plan.mp_search) },
      { key: "socialmedia", enabled: isEnabled(plan.mp_socialmedia) },
      { key: "progdisplay", enabled: isEnabled(plan.mp_progdisplay) },
      { key: "progvideo", enabled: isEnabled(plan.mp_progvideo) },
      { key: "progbvod", enabled: isEnabled(plan.mp_progbvod) },
      { key: "progaudio", enabled: isEnabled(plan.mp_progaudio) },
      { key: "progooh", enabled: isEnabled(plan.mp_progooh) },
      { key: "influencers", enabled: isEnabled(plan.mp_influencers) },
    ]

    const enabledTypes = mediaTypes.filter(({ enabled }) => enabled === true)

    return enabledTypes.map(({ key }) => {
      return (
        <Badge key={key} className="mr-1 mb-1 border text-[10px] font-medium" style={getMediaBadgeStyle(key)}>
          {key}
        </Badge>
      )
    })
  }

  const latestPlansForFilters = getLatestPlanVersions(mediaPlans)
  const clientFilterOptions = (() => {
    const map = new Map<string, string>()

    for (const plan of latestPlansForFilters) {
      const label = (plan.mp_clientname || "").toString().trim()
      if (!label) continue
      const key = normalizeClientFilterValue(label)
      if (!key) continue
      if (!map.has(key)) map.set(key, label)
    }

    return Array.from(map.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({
        value,
        label,
        keywords: `${label} ${value}`,
      }))
  })()

  const liveCampaigns = showTables ? applyDashboardTableFiltersToPlans(getLiveCampaigns(), dashboardFilters) : []
  const liveScopes = showTables ? applyDashboardTableFiltersToScopes(getLiveScopes(), dashboardFilters) : []
  const campaignsDueToStart = showTables ? applyDashboardTableFiltersToPlans(getCampaignsDueToStart(), dashboardFilters) : []
  const campaignsFinishedRecently = showTables
    ? applyDashboardTableFiltersToPlans(getCampaignsFinishedRecently(), dashboardFilters)
    : []

  const liveCampaignSelectors = {
    client: (plan: MediaPlan): SortableValue => plan.mp_clientname || "",
    campaign: (plan: MediaPlan): SortableValue => plan.mp_campaignname || "",
    mba: (plan: MediaPlan): SortableValue => plan.mp_mba_number || "",
    startDate: (plan: MediaPlan): SortableValue => safeDate(plan.mp_campaigndates_start),
    endDate: (plan: MediaPlan): SortableValue => safeDate(plan.mp_campaigndates_end),
    budget: (plan: MediaPlan): SortableValue => plan.mp_campaignbudget || 0,
    version: (plan: MediaPlan): SortableValue => plan.mp_version || 0,
    status: (plan: MediaPlan): SortableValue => plan.mp_campaignstatus || "",
  }

  const scopeSelectors = {
    project: (scope: ScopeOfWork): SortableValue => scope.project_name || "",
    client: (scope: ScopeOfWork): SortableValue => scope.client_name || "",
    scopeDate: (scope: ScopeOfWork): SortableValue => safeDate(scope.scope_date),
    status: (scope: ScopeOfWork): SortableValue => scope.project_status || "",
  }

  const sortedLiveCampaigns = applySort(liveCampaigns, liveCampaignSort, liveCampaignSelectors)
  const sortedLiveScopes = applySort(liveScopes, liveScopesSort, scopeSelectors)
  const sortedDueSoon = applySort(campaignsDueToStart, dueSoonSort, liveCampaignSelectors)
  const sortedFinished = applySort(campaignsFinishedRecently, finishedSort, liveCampaignSelectors)

  const shouldScrollLiveCampaigns = sortedLiveCampaigns.length > 12
  const shouldScrollLiveScopes = sortedLiveScopes.length > 12
  const shouldScrollDueSoon = sortedDueSoon.length > 12
  const shouldScrollFinished = sortedFinished.length > 12

  const tableSectionVisible =
    layoutPanels.liveCampaigns || layoutPanels.scopes || layoutPanels.dueSoon || layoutPanels.finishedRecently

  const chartCardQuiet = "border-0 bg-transparent shadow-none"

  return (
    <>
    <div className="flex h-full w-full flex-col gap-6 px-4 pb-10 pt-6 md:px-6">
      <MediaPlanEditorHero
        className="mb-1"
        compact
        title={title}
        Icon={BarChart3}
        detail={
          timeRangeDescription || dataLastRefreshedAt ? (
            <p>
              {timeRangeDescription}
              {dataLastRefreshedAt ? (
                <span
                  className={
                    timeRangeDescription
                      ? "ml-2 text-xs opacity-60"
                      : "text-xs text-muted-foreground opacity-80"
                  }
                >
                  {timeRangeDescription ? "· " : null}
                  Updated {format(dataLastRefreshedAt, "h:mm a")}
                </span>
              ) : null}
            </p>
          ) : null
        }
        actions={
          <div className="w-full min-w-0 lg:max-w-[1040px]">
            <div className="flex w-full flex-wrap items-center gap-2 lg:flex-nowrap lg:justify-end">
              <div className="w-full sm:w-[240px] lg:w-[220px]">
                <Label htmlFor="dashboard-campaign-search" className="sr-only">
                  Search
                </Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="dashboard-campaign-search"
                    value={dashboardFilters.campaignSearch}
                    onChange={(e) => setDashboardFilters((f) => ({ ...f, campaignSearch: e.target.value }))}
                    placeholder="Search campaigns..."
                    className="h-9 pl-10 border-border/50 bg-muted/30 transition-colors focus:bg-background"
                  />
                </div>
              </div>

              <div className="w-full sm:w-[320px] lg:w-[300px]">
                <Label className="sr-only">Clients</Label>
                <MultiSelectCombobox
                  options={clientFilterOptions}
                  values={dashboardFilters.clients}
                  onValuesChange={(v) => setDashboardFilters((f) => ({ ...f, clients: v }))}
                  placeholder="All clients"
                  allSelectedText="All clients"
                  selectAllText="Select all"
                  clearAllText="Clear all"
                  searchPlaceholder="Filter clients..."
                  emptyText="No clients found."
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap lg:justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9 whitespace-nowrap text-xs"
                  onClick={handleSaveSelectedClients}
                  disabled={!legacyPinnedClientsKey}
                  title={!legacyPinnedClientsKey ? "Sign in to save selected clients" : undefined}
                >
                  {savedViewJustSaved ? "Saved" : "Save selected clients"}
                </Button>
                {savedViews.length > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 whitespace-nowrap"
                    onClick={handleClearAllSavedViews}
                    disabled={!savedViewsListKey}
                  >
                    Clear all saved
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 whitespace-nowrap text-xs"
                  onClick={handleClearDashboardFilters}
                  disabled={
                    !dashboardFilters.campaignSearch.trim() &&
                    dashboardFilters.clients.length === 0 &&
                    dashboardFilters.publishers.length === 0 &&
                    !dashboardFilters.month
                  }
                >
                  <FilterX className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                  Clear filters
                </Button>
              </div>
            </div>
          </div>
        }
      />

      <div className="flex w-full items-center justify-end text-[11px] text-muted-foreground/70">
        {dashboardFilters.publishers.length > 0 || dashboardFilters.month ? (
          <p className="truncate">
            Chart filters:
            {dashboardFilters.publishers.length > 0
              ? ` Publisher: ${dashboardFilters.publishers.join(", ")}`
              : null}
            {dashboardFilters.month ? ` · Month: ${dashboardFilters.month}` : null}
          </p>
        ) : null}
      </div>

      {fetchError ? (
        <div>
          <Panel variant="error" className="w-full max-w-none overflow-hidden border-0 shadow-md">
            <div className="h-1 bg-gradient-to-r from-destructive via-destructive/70 to-destructive/40" />
            <PanelHeader className="pb-2">
              <PanelTitle>{fetchError.title}</PanelTitle>
            </PanelHeader>
            <PanelContent>
              <div
                role="alert"
                className={cn(
                  "flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive",
                  "sm:flex-row sm:items-center sm:justify-between"
                )}
              >
                <p className="min-w-0 flex-1">{fetchError.detail}</p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 sm:w-auto h-8 text-xs"
                  onClick={() => {
                    setFetchError(null)
                    void fetchData()
                  }}
                >
                  Retry
                </Button>
              </div>
            </PanelContent>
          </Panel>
        </div>
      ) : null}

      {showMetrics && layoutPanels.keyMetrics ? (
        <PanelRow
          title="Key metrics"
        >
          <TooltipProvider delayDuration={200}>
            {dashboardMetrics.map((metric) => (
              <PanelRowCell key={metric.title} span="quarter">
                <Panel className="h-full overflow-hidden border-0 shadow-md">
                  <div className={`h-1 bg-gradient-to-r ${metric.gradient}`} />
                  <PanelContent standalone className="flex h-full flex-col justify-between gap-4 p-5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="w-full rounded-md text-left outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{metric.title}</span>
                            <span className={`shrink-0 rounded-full p-2 ${metric.iconBg}`}>
                              <metric.icon className={`h-4 w-4 ${metric.iconText}`} aria-hidden />
                            </span>
                          </div>
                          <span className="mt-3 block text-3xl font-bold tabular-nums tracking-tight">{metric.value}</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{metric.tooltip}</p>
                      </TooltipContent>
                    </Tooltip>
                  </PanelContent>
                </Panel>
              </PanelRowCell>
            ))}
          </TooltipProvider>
        </PanelRow>
      ) : null}

      {showTables && tableSectionVisible ? (
        <>
          <div className="pt-4 pb-1">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">Campaigns & scope data</h2>
          </div>
          <PanelRow
            actions={<ListGridToggle value={listGridMode} onChange={setListGridMode} />}
          >
          {layoutPanels.liveCampaigns ? (
          <PanelRowCell span="full">
            <Panel className="w-full overflow-hidden border-0 shadow-md">
              <div className="h-1 bg-gradient-to-r from-green-500 via-green-500/70 to-green-500/40" />
              <PanelHeader className="items-center pb-2">
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <PanelTitle className="text-base">Live Campaigns (Booked / Approved / Completed)</PanelTitle>
                  <Badge variant="secondary" className="w-fit shrink-0 bg-green-500/10 text-green-600 border-0 text-xs font-medium tabular-nums">
                    {liveCampaigns.length} {liveCampaigns.length === 1 ? "Campaign" : "Campaigns"}
                  </Badge>
                </div>
              </PanelHeader>
              <PanelContent>
                {loading ? (
                  <div className="space-y-2">
                    <div className="h-10 w-full bg-muted/40 animate-pulse rounded"></div>
                    <div className="h-10 w-full bg-muted/40 animate-pulse rounded"></div>
                  </div>
                ) : liveCampaigns.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No live campaigns</p>
                ) : listGridMode === "list" ? (
                  <div className={`overflow-x-auto ${shouldScrollLiveCampaigns ? "max-h-[1008px] overflow-y-auto" : ""}`}>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <SortableTableHeader label="Client Name" direction={liveCampaignSort.column === "client" ? liveCampaignSort.direction : null} onToggle={() => toggleSort("client", liveCampaignSort, setLiveCampaignSort)} />
                          <SortableTableHeader label="Campaign Name" direction={liveCampaignSort.column === "campaign" ? liveCampaignSort.direction : null} onToggle={() => toggleSort("campaign", liveCampaignSort, setLiveCampaignSort)} />
                          <SortableTableHeader label="MBA Number" direction={liveCampaignSort.column === "mba" ? liveCampaignSort.direction : null} onToggle={() => toggleSort("mba", liveCampaignSort, setLiveCampaignSort)} />
                          <SortableTableHeader label="Start Date" direction={liveCampaignSort.column === "startDate" ? liveCampaignSort.direction : null} onToggle={() => toggleSort("startDate", liveCampaignSort, setLiveCampaignSort)} />
                          <SortableTableHeader label="End Date" direction={liveCampaignSort.column === "endDate" ? liveCampaignSort.direction : null} onToggle={() => toggleSort("endDate", liveCampaignSort, setLiveCampaignSort)} />
                          <SortableTableHeader label="Budget" direction={liveCampaignSort.column === "budget" ? liveCampaignSort.direction : null} onToggle={() => toggleSort("budget", liveCampaignSort, setLiveCampaignSort)} />
                          <SortableTableHeader label="Version" direction={liveCampaignSort.column === "version" ? liveCampaignSort.direction : null} onToggle={() => toggleSort("version", liveCampaignSort, setLiveCampaignSort)} />
                          <TableHead>Media Types</TableHead>
                          <TableHead className="w-24">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedLiveCampaigns.map((plan) => (
                          <TableRow key={plan.id}>
                            <TableCell>{plan.mp_clientname}</TableCell>
                            <TableCell>{plan.mp_campaignname}</TableCell>
                            <TableCell>{plan.mp_mba_number}</TableCell>
                            <TableCell>{formatDate(plan.mp_campaigndates_start)}</TableCell>
                            <TableCell>{formatDate(plan.mp_campaigndates_end)}</TableCell>
                            <TableCell>{formatCurrency(plan.mp_campaignbudget)}</TableCell>
                            <TableCell>{plan.mp_version}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {getMediaTypeTags(plan)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2.5 text-xs"
                                  onClick={() =>
                                    router.push(`/mediaplans/mba/${plan.mp_mba_number}/edit?version=${plan.mp_version}`)
                                  }
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="h-7 px-2.5 text-xs"
                                  disabled={!slugifyClientName(plan.mp_clientname)}
                                  onClick={() => {
                                    const slug = slugifyClientName(plan.mp_clientname)
                                    if (!slug) return
                                    router.push(`/dashboard/${slug}/${plan.mp_mba_number}`)
                                  }}
                                >
                                  View
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className={dashboardCampaignGridClassName(shouldScrollLiveCampaigns)}>
                    {sortedLiveCampaigns.map((plan) => (
                      <DashboardCampaignPlanCard
                        key={plan.id}
                        plan={plan}
                        formatDate={formatDate}
                        formatCurrency={formatCurrency}
                        mediaTypeTags={getMediaTypeTags(plan)}
                        showStatus={false}
                        statusBadgeClassName={getStatusBadgeColor(plan.mp_campaignstatus)}
                        onEdit={() => router.push(`/mediaplans/mba/${plan.mp_mba_number}/edit?version=${plan.mp_version}`)}
                        onView={() => {
                          const slug = slugifyClientName(plan.mp_clientname)
                          if (!slug) return
                          router.push(`/dashboard/${slug}/${plan.mp_mba_number}`)
                        }}
                        viewDisabled={!slugifyClientName(plan.mp_clientname)}
                      />
                    ))}
                  </div>
                )}
              </PanelContent>
            </Panel>
          </PanelRowCell>
          ) : null}

          {layoutPanels.scopes ? (
          <PanelRowCell span="full">
            <DashboardCollapsiblePanel
              isMd={isMd}
              open={openScopesPanel}
              onOpenChange={setOpenScopesPanel}
              panelTitle="Live Scopes of Work"
              gradientClassName="bg-gradient-to-r from-green-500 via-green-500/70 to-green-500/40"
              badge={
                <Badge variant="secondary" className="ml-auto w-fit shrink-0 bg-green-500/10 text-green-600 border-0 text-xs font-medium tabular-nums">
                  {liveScopes.length} {liveScopes.length === 1 ? "Scope" : "Scopes"}
                </Badge>
              }
            >
                {loading ? (
                  <div className="space-y-2">
                    <div className="h-10 w-full bg-muted/40 animate-pulse rounded"></div>
                  </div>
                ) : liveScopes.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No live scopes of work</p>
                ) : listGridMode === "list" ? (
                  <div className={`overflow-x-auto ${shouldScrollLiveScopes ? "max-h-[1008px] overflow-y-auto" : ""}`}>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <SortableTableHeader label="Project Name" direction={liveScopesSort.column === "project" ? liveScopesSort.direction : null} onToggle={() => toggleSort("project", liveScopesSort, setLiveScopesSort)} />
                          <SortableTableHeader label="Client Name" direction={liveScopesSort.column === "client" ? liveScopesSort.direction : null} onToggle={() => toggleSort("client", liveScopesSort, setLiveScopesSort)} />
                          <SortableTableHeader label="Scope Date" direction={liveScopesSort.column === "scopeDate" ? liveScopesSort.direction : null} onToggle={() => toggleSort("scopeDate", liveScopesSort, setLiveScopesSort)} />
                          <TableHead>Project Overview</TableHead>
                          <SortableTableHeader label="Status" direction={liveScopesSort.column === "status" ? liveScopesSort.direction : null} onToggle={() => toggleSort("status", liveScopesSort, setLiveScopesSort)} />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedLiveScopes.map((scope) => (
                          <TableRow key={scope.id}>
                            <TableCell className="font-medium">{scope.project_name}</TableCell>
                            <TableCell>{scope.client_name}</TableCell>
                            <TableCell>{formatDate(scope.scope_date)}</TableCell>
                            <TableCell>
                              <div className="max-w-md truncate" title={scope.project_overview}>
                                {scope.project_overview || "N/A"}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={getStatusBadgeColor(scope.project_status)}>{scope.project_status}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className={dashboardCampaignGridClassName(shouldScrollLiveScopes)}>
                    {sortedLiveScopes.map((scope) => (
                      <DashboardScopeCard
                        key={scope.id}
                        scope={scope}
                        formatDate={formatDate}
                        statusBadgeClassName={getStatusBadgeColor(scope.project_status)}
                      />
                    ))}
                  </div>
                )}
            </DashboardCollapsiblePanel>
          </PanelRowCell>
          ) : null}

          {layoutPanels.dueSoon ? (
          <PanelRowCell span="full">
            <DashboardCollapsiblePanel
              isMd={isMd}
              open={openDueSoonPanel}
              onOpenChange={setOpenDueSoonPanel}
              panelTitle="Campaigns Starting Soon (Next 10 Days)"
              gradientClassName="bg-gradient-to-r from-blue-500 via-blue-500/70 to-blue-500/40"
              badge={
                <Badge variant="secondary" className="ml-auto w-fit shrink-0 bg-blue-500/10 text-blue-600 border-0 text-xs font-medium tabular-nums">
                  {campaignsDueToStart.length} {campaignsDueToStart.length === 1 ? "Campaign" : "Campaigns"}
                </Badge>
              }
            >
                {loading ? (
                  <div className="space-y-2">
                    <div className="h-10 w-full bg-muted/40 animate-pulse rounded"></div>
                  </div>
                ) : campaignsDueToStart.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No campaigns starting in the next 10 days</p>
                ) : listGridMode === "list" ? (
                  <div className={`overflow-x-auto ${shouldScrollDueSoon ? "max-h-[1008px] overflow-y-auto" : ""}`}>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <SortableTableHeader label="Client Name" direction={dueSoonSort.column === "client" ? dueSoonSort.direction : null} onToggle={() => toggleSort("client", dueSoonSort, setDueSoonSort)} />
                          <SortableTableHeader label="Campaign Name" direction={dueSoonSort.column === "campaign" ? dueSoonSort.direction : null} onToggle={() => toggleSort("campaign", dueSoonSort, setDueSoonSort)} />
                          <SortableTableHeader label="MBA Number" direction={dueSoonSort.column === "mba" ? dueSoonSort.direction : null} onToggle={() => toggleSort("mba", dueSoonSort, setDueSoonSort)} />
                          <SortableTableHeader label="Start Date" direction={dueSoonSort.column === "startDate" ? dueSoonSort.direction : null} onToggle={() => toggleSort("startDate", dueSoonSort, setDueSoonSort)} />
                          <SortableTableHeader label="End Date" direction={dueSoonSort.column === "endDate" ? dueSoonSort.direction : null} onToggle={() => toggleSort("endDate", dueSoonSort, setDueSoonSort)} />
                          <SortableTableHeader label="Budget" direction={dueSoonSort.column === "budget" ? dueSoonSort.direction : null} onToggle={() => toggleSort("budget", dueSoonSort, setDueSoonSort)} />
                          <SortableTableHeader label="Status" direction={dueSoonSort.column === "status" ? dueSoonSort.direction : null} onToggle={() => toggleSort("status", dueSoonSort, setDueSoonSort)} />
                          <TableHead>Media Types</TableHead>
                          <TableHead className="w-24">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedDueSoon.map((plan) => (
                          <TableRow key={plan.id}>
                            <TableCell>{plan.mp_clientname}</TableCell>
                            <TableCell>{plan.mp_campaignname}</TableCell>
                            <TableCell>{plan.mp_mba_number}</TableCell>
                            <TableCell>{formatDate(plan.mp_campaigndates_start)}</TableCell>
                            <TableCell>{formatDate(plan.mp_campaigndates_end)}</TableCell>
                            <TableCell>{formatCurrency(plan.mp_campaignbudget)}</TableCell>
                            <TableCell>
                              <Badge className={getStatusBadgeColor(plan.mp_campaignstatus)}>{plan.mp_campaignstatus}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {getMediaTypeTags(plan)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2.5 text-xs"
                                  onClick={() =>
                                    router.push(`/mediaplans/mba/${plan.mp_mba_number}/edit?version=${plan.mp_version}`)
                                  }
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="h-7 px-2.5 text-xs"
                                  disabled={!slugifyClientName(plan.mp_clientname)}
                                  onClick={() => {
                                    const slug = slugifyClientName(plan.mp_clientname)
                                    if (!slug) return
                                    router.push(`/dashboard/${slug}/${plan.mp_mba_number}`)
                                  }}
                                >
                                  View
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className={dashboardCampaignGridClassName(shouldScrollDueSoon)}>
                    {sortedDueSoon.map((plan) => (
                      <DashboardCampaignPlanCard
                        key={plan.id}
                        plan={plan}
                        formatDate={formatDate}
                        formatCurrency={formatCurrency}
                        mediaTypeTags={getMediaTypeTags(plan)}
                        showStatus
                        statusBadgeClassName={getStatusBadgeColor(plan.mp_campaignstatus)}
                        onEdit={() => router.push(`/mediaplans/mba/${plan.mp_mba_number}/edit?version=${plan.mp_version}`)}
                        onView={() => {
                          const slug = slugifyClientName(plan.mp_clientname)
                          if (!slug) return
                          router.push(`/dashboard/${slug}/${plan.mp_mba_number}`)
                        }}
                        viewDisabled={!slugifyClientName(plan.mp_clientname)}
                      />
                    ))}
                  </div>
                )}
            </DashboardCollapsiblePanel>
          </PanelRowCell>
          ) : null}

          {layoutPanels.finishedRecently ? (
          <PanelRowCell span="full">
            <DashboardCollapsiblePanel
              isMd={isMd}
              open={openFinishedPanel}
              onOpenChange={setOpenFinishedPanel}
              panelTitle="Campaigns Finished in Past 40 Days"
              gradientClassName="bg-gradient-to-r from-teal-500 via-teal-500/70 to-teal-500/40"
              badge={
                <Badge variant="secondary" className="ml-auto w-fit shrink-0 bg-teal-500/10 text-teal-600 border-0 text-xs font-medium tabular-nums">
                  {campaignsFinishedRecently.length}{" "}
                  {campaignsFinishedRecently.length === 1 ? "Campaign" : "Campaigns"}
                </Badge>
              }
            >
                {loading ? (
                  <div className="space-y-2">
                    <div className="h-10 w-full bg-muted/40 animate-pulse rounded"></div>
                  </div>
                ) : campaignsFinishedRecently.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No campaigns finished in the past 40 days</p>
                ) : listGridMode === "list" ? (
                  <div className={`overflow-x-auto ${shouldScrollFinished ? "max-h-[1008px] overflow-y-auto" : ""}`}>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <SortableTableHeader label="Client Name" direction={finishedSort.column === "client" ? finishedSort.direction : null} onToggle={() => toggleSort("client", finishedSort, setFinishedSort)} />
                          <SortableTableHeader label="Campaign Name" direction={finishedSort.column === "campaign" ? finishedSort.direction : null} onToggle={() => toggleSort("campaign", finishedSort, setFinishedSort)} />
                          <SortableTableHeader label="MBA Number" direction={finishedSort.column === "mba" ? finishedSort.direction : null} onToggle={() => toggleSort("mba", finishedSort, setFinishedSort)} />
                          <SortableTableHeader label="Start Date" direction={finishedSort.column === "startDate" ? finishedSort.direction : null} onToggle={() => toggleSort("startDate", finishedSort, setFinishedSort)} />
                          <SortableTableHeader label="End Date" direction={finishedSort.column === "endDate" ? finishedSort.direction : null} onToggle={() => toggleSort("endDate", finishedSort, setFinishedSort)} />
                          <SortableTableHeader label="Budget" direction={finishedSort.column === "budget" ? finishedSort.direction : null} onToggle={() => toggleSort("budget", finishedSort, setFinishedSort)} />
                          <SortableTableHeader label="Status" direction={finishedSort.column === "status" ? finishedSort.direction : null} onToggle={() => toggleSort("status", finishedSort, setFinishedSort)} />
                          <TableHead>Media Types</TableHead>
                          <TableHead className="w-24">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedFinished.map((plan) => (
                          <TableRow key={plan.id}>
                            <TableCell>{plan.mp_clientname}</TableCell>
                            <TableCell>{plan.mp_campaignname}</TableCell>
                            <TableCell>{plan.mp_mba_number}</TableCell>
                            <TableCell>{formatDate(plan.mp_campaigndates_start)}</TableCell>
                            <TableCell>{formatDate(plan.mp_campaigndates_end)}</TableCell>
                            <TableCell>{formatCurrency(plan.mp_campaignbudget)}</TableCell>
                            <TableCell>
                              <Badge className={getStatusBadgeColor(plan.mp_campaignstatus)}>{plan.mp_campaignstatus}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {getMediaTypeTags(plan)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2.5 text-xs"
                                  onClick={() =>
                                    router.push(`/mediaplans/mba/${plan.mp_mba_number}/edit?version=${plan.mp_version}`)
                                  }
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="h-7 px-2.5 text-xs"
                                  disabled={!slugifyClientName(plan.mp_clientname)}
                                  onClick={() => {
                                    const slug = slugifyClientName(plan.mp_clientname)
                                    if (!slug) return
                                    router.push(`/dashboard/${slug}/${plan.mp_mba_number}`)
                                  }}
                                >
                                  View
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className={dashboardCampaignGridClassName(shouldScrollFinished)}>
                    {sortedFinished.map((plan) => (
                      <DashboardCampaignPlanCard
                        key={plan.id}
                        plan={plan}
                        formatDate={formatDate}
                        formatCurrency={formatCurrency}
                        mediaTypeTags={getMediaTypeTags(plan)}
                        showStatus
                        statusBadgeClassName={getStatusBadgeColor(plan.mp_campaignstatus)}
                        onEdit={() => router.push(`/mediaplans/mba/${plan.mp_mba_number}/edit?version=${plan.mp_version}`)}
                        onView={() => {
                          const slug = slugifyClientName(plan.mp_clientname)
                          if (!slug) return
                          router.push(`/dashboard/${slug}/${plan.mp_mba_number}`)
                        }}
                        viewDisabled={!slugifyClientName(plan.mp_clientname)}
                      />
                    ))}
                  </div>
                )}
            </DashboardCollapsiblePanel>
          </PanelRowCell>
          ) : null}
        </PanelRow>
        </>
      ) : null}

      <div className="pt-4 pb-1">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">Performance insights</h2>
      </div>

      {layoutPanels.spendBreakdown ? (
        <PanelRow
          title="Spend breakdown"
          helperText="Media cost only — current financial year (billing schedule). Publisher treemap: drill down to the publishers list (query param). Client treemap: filter tables above."
        >
          <PanelRowCell>
            <Panel className="overflow-hidden border-0 shadow-md">
              <PanelContent standalone className="p-0">
                <TreemapShellChart
                  title="Spend via Publisher"
                  description="Media cost only - Current financial year"
                  data={publisherSpendData}
                  onDatumClick={handleSpendPublisherPieClick}
                  className={cn("rounded-lg", chartCardQuiet)}
                />
              </PanelContent>
            </Panel>
          </PanelRowCell>
          <PanelRowCell>
            <Panel className="overflow-hidden border-0 shadow-md">
              <PanelContent standalone className="p-0">
                <TreemapShellChart
                  title="Spend via Client"
                  description="Media cost only - Current financial year"
                  data={clientSpendData}
                  colorByName={dashboardClientTreemapColors}
                  onDatumClick={handleSpendClientPieClick}
                  className={cn("rounded-lg", chartCardQuiet)}
                />
              </PanelContent>
            </Panel>
          </PanelRowCell>
        </PanelRow>
      ) : null}

      {layoutPanels.monthlyTrends ? (
        <MobileCollapsibleSection
          isMd={isMd}
          open={openMonthlyCharts}
          onOpenChange={setOpenMonthlyCharts}
          title="Monthly breakdowns"
          helperText="Stacked totals by client and publisher for the current financial year. Click a segment or legend to filter by client or publisher (and month when clicking a bar segment). Each chart also has a keyboard filter control below the graphic."
        >
          <div className="flex flex-col gap-4">
            <Panel className="overflow-hidden border-0 shadow-md">
              <PanelContent standalone className="p-0">
                <BaseChartCard
                  title="Monthly Spend by Client"
                  description="Media cost by client per month (current FY, billing schedule)"
                  variant="icon"
                  icon={BarChart3}
                  className={cn("rounded-lg", chartCardQuiet)}
                >
                  <StackedColumnChart
                    data={monthlyClientStackedRows}
                    xKey="month"
                    series={monthlyClientStackedSeries}
                    seriesColorByKey={dashboardMonthlyClientSeriesColors}
                    onDatumClick={handleMonthlyClientChartClick}
                    filterViaLegend
                  />
                </BaseChartCard>
              </PanelContent>
            </Panel>

            <Panel className="overflow-hidden border-0 shadow-md">
              <PanelContent standalone className="p-0">
                <BaseChartCard
                  title="Monthly Spend by Publisher"
                  description="Media cost by publisher per month (current FY, billing schedule)"
                  variant="icon"
                  icon={BarChart3}
                  className={cn("rounded-lg", chartCardQuiet)}
                >
                  <StackedColumnChart
                    data={monthlyPublisherStackedRows}
                    xKey="month"
                    series={monthlyPublisherStackedSeries}
                    onDatumClick={handleMonthlyPublisherChartClick}
                    filterViaLegend
                  />
                </BaseChartCard>
              </PanelContent>
            </Panel>
          </div>
        </MobileCollapsibleSection>
      ) : null}

    </div>
    </>
  )
}

