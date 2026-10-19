import "server-only"

import { and, eq, sql } from "drizzle-orm"

import { getDb } from "@/db"
import { clientWebReportVersions, clientWebReports } from "@/db/schema"
import { getClientDashboardData } from "@/lib/api/dashboard"
import { fetchXanoClientRowByUrlSlug } from "@/lib/clients/fetchClientRowByUrlSlug"
import {
  listActivePlatformAccounts,
  PlatformAccountsNotReadyError,
} from "@/lib/clients/platformAccountsRepo"
import { isPlannedBasisCampaignStatus } from "@/lib/dashboard/plannedSpendConsistency"
import { loadWebReportData } from "@/lib/webReport/data/load"
import { cleanLayout } from "@/lib/webReport/builder/layout"
import {
  DEFAULT_WEB_REPORT_LAYOUT,
  type WebReportLayoutItem,
} from "@/lib/webReport/elements"
import { isReportPeriod, resolveReportWindows, addIsoDays, parseIsoDate, formatIsoDate, daysInMonth, type ReportPeriod, type ReportWindows } from "@/lib/webReport/periods"
import type { WebReportData } from "@/lib/webReport/types"
import { sydneyYmdFromUtcInstant } from "@/lib/myhours/sydneyWeek"

export class WebReportRangeError extends Error {
  constructor() {
    super("bad range")
    this.name = "WebReportRangeError"
  }
}

export type WebReportResponse = {
  clientName: string
  connected: boolean
  source: "published" | "default"
  layout: WebReportLayoutItem[]
  data: WebReportData
}

function clientIdFromRow(row: Record<string, unknown> | null): number | null {
  const raw = row?.id ?? row?.clients_id
  const id = typeof raw === "number" ? raw : Number(raw)
  return Number.isFinite(id) && id > 0 ? id : null
}

function ga4Digits(ref: string | null | undefined): string | null {
  if (!ref) return null
  const digits = ref.replace(/^properties\//i, "").trim()
  return /^\d+$/.test(digits) ? digits : null
}

async function reportsTableReady(): Promise<boolean> {
  try {
    const db = getDb()
    const result = await db.execute(sql`SELECT to_regclass('public.client_web_reports') AS rel`)
    const list =
      (result as unknown as { rows?: Record<string, unknown>[] }).rows ??
      (result as unknown as Record<string, unknown>[])
    const row = Array.isArray(list) ? list[0] : undefined
    const rel = row?.rel ?? row?.REL
    return rel != null && String(rel).length > 0
  } catch (err) {
    console.warn("[web-report] could not check client_web_reports", err)
    return false
  }
}

async function publishedLayout(clientId: number): Promise<{
  layout: WebReportLayoutItem[]
  brandTerms: string[]
  defaultPeriod: ReportPeriod
  ga4PropertyId: string | null
  gscSite: string | null
  source: "published" | "default"
} | null> {
  if (!(await reportsTableReady())) return null
  try {
    const db = getDb()
    const [report] = await db
      .select()
      .from(clientWebReports)
      .where(eq(clientWebReports.clientId, clientId))
      .limit(1)
    if (!report || report.status !== "published" || report.currentVersion < 1) return null
    const [version] = await db
      .select()
      .from(clientWebReportVersions)
      .where(
        and(
          eq(clientWebReportVersions.reportId, report.id),
          eq(clientWebReportVersions.version, report.currentVersion),
        ),
      )
      .limit(1)
    const layout = cleanLayout(version?.layout)
    if (!layout) return null
    const period = isReportPeriod(report.defaultPeriod) ? report.defaultPeriod : "last_month"
    return {
      layout,
      brandTerms: report.brandTerms ?? [],
      defaultPeriod: period,
      ga4PropertyId: ga4Digits(report.ga4PropertyRef),
      gscSite: report.gscSiteRef?.trim() || null,
      source: "published",
    }
  } catch (err) {
    console.warn("[web-report] published layout unavailable, using the default", err)
    return null
  }
}

async function platformRefs(clientId: number): Promise<{ ga4PropertyId: string | null; gscSite: string | null }> {
  try {
    const accounts = await listActivePlatformAccounts(clientId)
    const ga4 = accounts.find((account) => account.platform === "ga4")
    const gsc = accounts.find((account) => account.platform === "gsc")
    return {
      ga4PropertyId: ga4Digits(ga4?.accountRef),
      gscSite: gsc?.accountRef?.trim() || null,
    }
  } catch (err) {
    if (!(err instanceof PlatformAccountsNotReadyError)) {
      console.warn("[web-report] platform accounts unavailable", err)
    }
    return { ga4PropertyId: null, gscSite: null }
  }
}

export function windowsForRequest(input: {
  period: ReportPeriod
  today: string
  from?: string | null
  to?: string | null
}): ReportWindows {
  const labelled = resolveReportWindows(input.period, input.today)
  if (!input.from || !input.to) return labelled
  const start = parseIsoDate(input.from)
  const end = parseIsoDate(input.to)
  if (!start || !end || input.from > input.to) throw new WebReportRangeError()
  if (input.period === "month_to_date_yoy") {
    return {
      ...labelled,
      current: { from: input.from, to: input.to },
      previous: {
        from: formatIsoDate(start.y - 1, start.m, Math.min(start.d, daysInMonth(start.y - 1, start.m))),
        to: formatIsoDate(end.y - 1, end.m, Math.min(end.d, daysInMonth(end.y - 1, end.m))),
      },
    }
  }
  const length = daysInclusive(input.from, input.to)
  const previousTo = addIsoDays(input.from, -1)
  const previousFrom = addIsoDays(previousTo, -(length - 1))
  return {
    ...labelled,
    current: { from: input.from, to: input.to },
    previous: { from: previousFrom, to: previousTo },
  }
}

function daysInclusive(from: string, to: string): number {
  const start = parseIsoDate(from)
  const end = parseIsoDate(to)
  if (!start || !end) return 1
  const a = Date.UTC(start.y, start.m - 1, start.d)
  const b = Date.UTC(end.y, end.m - 1, end.d)
  return Math.round((b - a) / 86_400_000) + 1
}

export async function loadWebReportResponse(input: {
  slug: string
  period?: string | null
  from?: string | null
  to?: string | null
}): Promise<WebReportResponse | null> {
  const [dashboard, clientRow] = await Promise.all([
    getClientDashboardData(input.slug),
    fetchXanoClientRowByUrlSlug(input.slug),
  ])
  if (!dashboard) return null
  const clientId = clientIdFromRow(clientRow)
  const saved = clientId != null ? await publishedLayout(clientId) : null
  const accounts = clientId != null ? await platformRefs(clientId) : { ga4PropertyId: null, gscSite: null }
  const ga4PropertyId = saved?.ga4PropertyId ?? accounts.ga4PropertyId
  const gscSite = saved?.gscSite ?? accounts.gscSite
  const defaultPeriod = saved?.defaultPeriod ?? "last_month"
  const period = isReportPeriod(input.period) ? input.period : defaultPeriod
  const today = sydneyYmdFromUtcInstant(new Date())
  const windows = windowsForRequest({ period, today, from: input.from, to: input.to })
  const campaigns = [
    ...dashboard.liveCampaignsList,
    ...dashboard.planningCampaignsList,
    ...dashboard.completedCampaignsList,
  ]
    .filter((campaign) => isPlannedBasisCampaignStatus(campaign.status))
    .map((campaign) => ({
      mbaNumber: campaign.mbaNumber,
      versionNumber: Number.isFinite(campaign.version_number) ? campaign.version_number : undefined,
      mediaTypes: campaign.mediaTypes,
      planClientName: campaign.planClientName,
    }))
  const data = await loadWebReportData({
    windows,
    today,
    ga4PropertyId,
    gscSite,
    brandTerms: saved?.brandTerms ?? [],
    campaigns,
  })
  return {
    clientName: dashboard.clientName,
    connected: Boolean(ga4PropertyId || gscSite),
    source: saved?.source ?? "default",
    layout: saved?.layout ?? DEFAULT_WEB_REPORT_LAYOUT,
    data,
  }
}
