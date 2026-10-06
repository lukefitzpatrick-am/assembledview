import { NextRequest, NextResponse } from "next/server"
import { checkClientMbaAccess } from "@/lib/auth/checkClientMbaAccess"
import { parseDateSafe as safeParseDate } from "@/lib/dates/parseDateSafe"
import { parseDateOnlyString, toMelbourneDateString } from "@/lib/timezone"
import { getCachedClients } from "@/lib/finance/xanoReferenceCache"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { roundMoney4 } from "@/lib/format/money"
import { diffBillingSchedules } from "@/lib/finance/scheduleDiff"
import { writeScheduleDiffEdits } from "@/lib/finance/writeFinanceAuditEdits"
import { extractBillingMonthStart } from "@/lib/spend/billingScheduleExpectedToDate"
import { expectedSpendToDateFromDeliveryScheduleMonthly } from "@/lib/spend/monthlyPlanCalendar"
import { getDraftReturnRejection } from "@/lib/mediaplan/campaignStatusGuard"
import { invalidMbaNumberResponse, parseMbaNumber } from "@/lib/mediaplan/mbaNumber"
import { nextMbaVersionNumber } from "@/lib/mediaplan/nextMbaVersionNumber"
import { readBillingOverridesForVersion } from "@/lib/data/readFinance"
import type { BillingOverrideRow } from "@/lib/finance/billingOverrides"
import type { FeeLoading, LineItemInput } from "@/lib/finance/campaignFinancials.types"
import { recomputeAndValidateBillingScheduleOnSave } from "@/lib/finance/recomputeBillingScheduleOnSave"
import { appendPartialApprovalToBillingSchedule } from "@/lib/mediaplan/partialMba"
import {
  isUnpublishedStagedVersion,
  pickPublishedVersionRow,
  publishedVersionFromMaster,
} from "@/lib/mediaplan/publishedVersionGuard"
import {
  checkPublishLineItemIntegrity,
  countPublishIntegrityChildren,
  isPublishVersionAdvance,
} from "@/lib/mediaplan/publishVersionIntegrity"
import { getPlanDetailBackend } from "@/lib/data/backend"
import {
  PLAN_DETAIL_POSTGRES_ERROR_CODE,
  readMbaPlanDetailFromPostgres,
} from "@/lib/data/readMbaPlanDetail"
import {
  readVersionPublishedAtByMbaVersion,
  stampVersionPublicationByMbaVersion,
} from "@/lib/data/stampVersionPublication"
import {
  isVersionPublished,
  normalisePublishedByEmail,
} from "@/lib/mediaplan/versionPublication"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

const XANO_TIMEOUT_MS = 15_000
const XANO_LONG_TIMEOUT_MS = 30_000

type MediaLineItems = {
  television: any[]
  radio: any[]
  newspaper: any[]
  magazines: any[]
  ooh: any[]
  cinema: any[]
  search: any[]
  socialMedia: any[]
  digitalDisplay: any[]
  digitalAudio: any[]
  digitalVideo: any[]
  bvod: any[]
  integration: any[]
  progDisplay: any[]
  progVideo: any[]
  progBvod: any[]
  progAudio: any[]
  progOoh: any[]
  influencers: any[]
  production: any[]
}

const createEmptyLineItems = (): MediaLineItems => ({
  television: [],
  radio: [],
  newspaper: [],
  magazines: [],
  ooh: [],
  cinema: [],
  search: [],
  socialMedia: [],
  digitalDisplay: [],
  digitalAudio: [],
  digitalVideo: [],
  bvod: [],
  integration: [],
  progDisplay: [],
  progVideo: [],
  progBvod: [],
  progAudio: [],
  progOoh: [],
  influencers: [],
  production: []
})

function isTruthyFlag(value: any) {
  if (value === undefined || value === null) return false
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    return ["yes", "true", "1", "y", "on"].includes(normalized)
  }
  return false
}

function parseVersion(value: any): number | null {
  if (value === null || value === undefined) return null
  const num = typeof value === "string" ? parseInt(value, 10) : Number(value)
  return Number.isNaN(num) ? null : num
}

function parseJsonField(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }
  return value ?? null
}

function parseAmount(value: any): number {
  if (value === null || value === undefined) return 0
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]+/g, "")
    const parsed = parseFloat(cleaned)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function normalizeISODateOnlySafe(value: any): string | null {
  if (!value) return null
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return null
    const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (m) return trimmed
    const parsed = safeParseDate(trimmed)
    return parsed ? toMelbourneDateString(parsed) : null
  }
  const parsed = safeParseDate(value)
  return parsed ? toMelbourneDateString(parsed) : null
}

function clampISODateOnly(value: string | null, min: string | null, max: string | null): string | null {
  if (!value) return null
  const iso = normalizeISODateOnlySafe(value)
  if (!iso) return null
  if (min && iso < min) return min
  if (max && iso > max) return max
  return iso
}

function computeEffectiveDateRange(opts: {
  campaignStartISO: string | null
  campaignEndISO: string | null
  requestedStartISO: string | null
  requestedEndISO: string | null
}): { startISO: string | null; endISO: string | null } {
  const { campaignStartISO, campaignEndISO, requestedStartISO, requestedEndISO } = opts

  const startClamped = clampISODateOnly(requestedStartISO, campaignStartISO, campaignEndISO) ?? campaignStartISO
  const endClamped = clampISODateOnly(requestedEndISO, campaignStartISO, campaignEndISO) ?? campaignEndISO

  if (startClamped && endClamped && startClamped > endClamped) {
    return { startISO: endClamped, endISO: startClamped }
  }

  return { startISO: startClamped, endISO: endClamped }
}

function getMonthLabel(value: any): string {
  if (!value) return "Unknown"
  const date = new Date(value)
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric" })
  }
  return String(value)
}

function slugifyClientName(name: string | null | undefined): string {
  if (!name || typeof name !== "string") return ""
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .trim()
}

async function fetchClientBrandColour(clientName?: string | null): Promise<string | null> {
  if (!clientName) return null
  try {
    const clients = await getCachedClients()
    const targetSlug = slugifyClientName(clientName)
    const match = clients.find((client: any) => slugifyClientName(client?.mp_client_name || client?.name) === targetSlug) as
      | { brand_colour?: unknown; brandColor?: unknown }
      | undefined
    const colour = match?.brand_colour ?? match?.brandColor ?? match?.brand_colour
    if (typeof colour === "string" && colour.trim()) {
      return colour.trim()
    }
  } catch (error) {
    console.warn("[API] Failed to fetch client brand colour", {
      clientName,
      error: error instanceof Error ? error.message : String(error),
    })
  }
  return null
}

function calculateTimeElapsed(startDate: string, endDate: string): number {
  const start = safeParseDate(startDate)
  const end = safeParseDate(endDate)
  if (!start || !end) return 0
  const today = new Date()

  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)

  const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))
  const daysElapsed = Math.max(0, Math.ceil((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))

  if (today > end) return 100
  if (today < start) return 0

  const percentage = (daysElapsed / totalDays) * 100
  return Math.min(100, Math.max(0, Math.round(percentage * 100) / 100))
}

function calculateDayMetrics(startDate: string, endDate: string) {
  const start = safeParseDate(startDate)
  const end = safeParseDate(endDate)
  if (!start || !end) {
    return { daysInCampaign: 0, daysElapsed: 0, daysRemaining: 0 }
  }
  const today = new Date()

  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)

  const daysInCampaign = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1)
  const daysElapsed = today < start ? 0 : Math.min(daysInCampaign, Math.ceil((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1)
  const daysRemaining = Math.max(0, daysInCampaign - daysElapsed)

  return { daysInCampaign, daysElapsed, daysRemaining }
}

function startOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

function overlapsRange(itemStart: Date, itemEnd: Date, rangeStart: Date, rangeEnd: Date): boolean {
  const aStart = startOfDay(itemStart).getTime()
  const aEnd = startOfDay(itemEnd).getTime()
  const bStart = startOfDay(rangeStart).getTime()
  const bEnd = startOfDay(rangeEnd).getTime()
  return aStart <= bEnd && aEnd >= bStart
}

function filterBillingScheduleByRange(billingSchedule: any[], rangeStart: Date, rangeEnd: Date): any[] {
  if (!Array.isArray(billingSchedule)) return []
  return billingSchedule.filter((entry) => {
    const monthStart = extractBillingMonthStart(entry)
    if (!monthStart) return true
    const monthEnd = endOfDay(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0))
    return overlapsRange(monthStart, monthEnd, rangeStart, rangeEnd)
  })
}

function extractDeliveryEntryDate(entry: any): Date | null {
  const raw =
    entry?.date ??
    entry?.DATE ??
    entry?.startDate ??
    entry?.start_date ??
    entry?.periodStart ??
    entry?.period_start ??
    entry?.month ??
    entry?.monthYear
  return safeParseDate(raw)
}

function filterDeliveryScheduleByRange(deliverySchedule: any[], rangeStart: Date, rangeEnd: Date): any[] {
  if (!Array.isArray(deliverySchedule)) return []
  return deliverySchedule.filter((entry) => {
    const d = extractDeliveryEntryDate(entry)
    if (!d) return true
    const day = startOfDay(d)
    return day >= startOfDay(rangeStart) && day <= startOfDay(rangeEnd)
  })
}

function extractLineItemDateRange(item: any): { start: Date | null; end: Date | null } {
  if (!item || typeof item !== "object") return { start: null, end: null }
  const startCandidates = [
    item.start_date,
    item.startDate,
    item.flight_start,
    item.flightStart,
    item.period_start,
    item.periodStart,
    item.campaign_start_date,
    item.campaignStartDate,
    item.begin_date,
    item.beginDate,
  ]
  const endCandidates = [
    item.end_date,
    item.endDate,
    item.flight_end,
    item.flightEnd,
    item.period_end,
    item.periodEnd,
    item.campaign_end_date,
    item.campaignEndDate,
    item.finish_date,
    item.finishDate,
  ]
  const start = startCandidates.map(safeParseDate).find(Boolean) ?? null
  const end = endCandidates.map(safeParseDate).find(Boolean) ?? null
  return { start, end }
}

function filterLineItemsDataByRange(lineItems: MediaLineItems, rangeStart: Date, rangeEnd: Date): MediaLineItems {
  const next = createEmptyLineItems()
  ;(Object.keys(lineItems) as Array<keyof MediaLineItems>).forEach((key) => {
    const items = Array.isArray(lineItems[key]) ? lineItems[key] : []
    next[key] = items.filter((item) => {
      const { start, end } = extractLineItemDateRange(item)
      if (!start && !end) return true
      const itemStart = start ?? end
      const itemEnd = end ?? start
      if (!itemStart || !itemEnd) return true
      return overlapsRange(itemStart, itemEnd, rangeStart, rangeEnd)
    })
  })
  return next
}

function daysBetweenInclusive(start: Date, end: Date): number {
  const startDay = startOfDay(start).getTime()
  const endDay = startOfDay(end).getTime()
  if (endDay < startDay) return 0
  return Math.floor((endDay - startDay) / (1000 * 60 * 60 * 24)) + 1
}

function summarizeBillingSchedule(billingSchedule: any[]): {
  spendByMediaChannel: Array<{ mediaType: string; amount: number; percentage: number }>
  monthlySpend: Array<{ month: string; data: Array<{ mediaType: string; amount: number }> }>
} {
  const channelTotals: Record<string, number> = {}
  const monthlyTotals: Record<string, Record<string, number>> = {}

  billingSchedule.forEach((entry: any) => {
    const monthLabel = getMonthLabel(
      entry?.month ||
        entry?.billingMonth ||
        entry?.date ||
        entry?.startDate ||
        entry?.periodStart ||
        entry?.period_start
    )

    const mediaTypes = Array.isArray(entry?.mediaTypes) ? entry.mediaTypes : []

    if (mediaTypes.length === 0) {
      const uncategorizedAmount = parseAmount(entry?.totalAmount ?? entry?.amount)
      if (uncategorizedAmount > 0) {
        channelTotals["Uncategorized"] = (channelTotals["Uncategorized"] || 0) + uncategorizedAmount
        monthlyTotals[monthLabel] = monthlyTotals[monthLabel] || {}
        monthlyTotals[monthLabel]["Uncategorized"] = (monthlyTotals[monthLabel]["Uncategorized"] || 0) + uncategorizedAmount
      }
      return
    }

    mediaTypes.forEach((mt: any) => {
      const mediaType =
        mt?.mediaType ||
        mt?.media_type ||
        mt?.name ||
        "Other"

      const lineItemSum = Array.isArray(mt?.lineItems)
        ? mt.lineItems.reduce((sum: number, li: any) => {
            return sum + parseAmount(li?.amount ?? li?.totalAmount ?? li?.cost ?? li?.value ?? li?.total)
          }, 0)
        : 0

      const amount = lineItemSum || parseAmount(mt?.totalAmount ?? mt?.amount)
      if (amount <= 0) return

      channelTotals[mediaType] = (channelTotals[mediaType] || 0) + amount

      monthlyTotals[monthLabel] = monthlyTotals[monthLabel] || {}
      monthlyTotals[monthLabel][mediaType] = (monthlyTotals[monthLabel][mediaType] || 0) + amount
    })
  })

  const totalAmount = Object.values(channelTotals).reduce((sum, val) => sum + val, 0)
  const spendByMediaChannel = Object.entries(channelTotals).map(([mediaType, amount]) => ({
    mediaType,
    amount,
    percentage: totalAmount > 0 ? (amount / totalAmount) * 100 : 0
  }))

  const monthlySpend = Object.entries(monthlyTotals).map(([month, entries]) => ({
    month,
    data: Object.entries(entries).map(([mediaType, amount]) => ({
      mediaType,
      amount
    }))
  }))

  monthlySpend.sort((a, b) => {
    const aDate = new Date(a.month).getTime()
    const bDate = new Date(b.month).getTime()
    if (Number.isNaN(aDate) || Number.isNaN(bDate)) return a.month.localeCompare(b.month)
    return aDate - bDate
  })

  return { spendByMediaChannel, monthlySpend }
}

function normalizeDeliverySchedule(raw: any) {
  const parsed: any[] = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? (() => {
          try {
            const p = JSON.parse(raw)
            if (Array.isArray(p)) return p
            if (p && typeof p === "object" && Array.isArray(p.months)) return p.months
            return []
          } catch {
            return []
          }
        })()
      : raw && typeof raw === "object" && Array.isArray(raw.months)
        ? raw.months
        : []
  const spendByChannel: Record<string, number> = {}
  const monthlyMap: Record<string, Record<string, number>> = {}

  parsed.forEach((entry: any) => {
    const channel =
      entry?.channel ||
      entry?.media_channel ||
      entry?.mediaType ||
      entry?.media_type ||
      entry?.publisher ||
      entry?.placement ||
      "Other"

    const monthLabel = getMonthLabel(
      entry?.month ||
        entry?.monthYear ||
        entry?.billingMonth ||
        entry?.billing_month ||
        entry?.period_start ||
        entry?.periodStart ||
        entry?.date ||
        entry?.startDate
    )

    const amount = parseAmount(
      entry?.spend ??
        entry?.amount ??
        entry?.budget ??
        entry?.value ??
        entry?.investment ??
        entry?.media_investment
    )

    if (amount > 0) {
      spendByChannel[channel] = (spendByChannel[channel] || 0) + amount
      monthlyMap[monthLabel] = monthlyMap[monthLabel] || {}
      monthlyMap[monthLabel][channel] = (monthlyMap[monthLabel][channel] || 0) + amount
    }
  })

  const monthlySpend = Object.entries(monthlyMap)
    .map(([month, data]) => ({
      month,
      data: Object.entries(data).map(([mediaType, amount]) => ({ mediaType, amount })),
    }))
    .sort((a, b) => {
      const aDate = new Date(a.month).getTime()
      const bDate = new Date(b.month).getTime()
      if (Number.isNaN(aDate) || Number.isNaN(bDate)) return a.month.localeCompare(b.month)
      return aDate - bDate
    })

  const total = Object.values(spendByChannel).reduce((sum, v) => sum + v, 0)
  const spendByMediaChannel = Object.entries(spendByChannel).map(([mediaType, amount]) => ({
    mediaType,
    amount,
    percentage: total > 0 ? (amount / total) * 100 : 0,
  }))

  return {
    raw: parsed,
    spendByMediaChannel,
    monthlySpend,
  }
}

// GET latest version by MBA number
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mba_number: string }> }
) {
  try {
    const { mba_number: rawMbaNumber } = await params
    const mba_number = parseMbaNumber(rawMbaNumber)
    if (!mba_number) return invalidMbaNumberResponse()

    const access = await checkClientMbaAccess(request, mba_number)
    if (!access.ok) return access.response

    const requestUrl = new URL(request.url)
    const requestedVersionParam = requestUrl.searchParams.get("version")
    const requestedVersionNumber = requestedVersionParam ? parseInt(requestedVersionParam, 10) : null
    const requestedStartDateParam = requestUrl.searchParams.get("startDate")
    const requestedEndDateParam = requestUrl.searchParams.get("endDate")
    const billingScheduleFullParam = requestUrl.searchParams.get("billingScheduleFull")
    const billingScheduleFull =
      billingScheduleFullParam === "1" ||
      billingScheduleFullParam === "true" ||
      billingScheduleFullParam === "yes"
    const includeVersionsMeta =
      requestUrl.searchParams.get("includeVersionsMeta") === "1" ||
      requestUrl.searchParams.get("includeVersionsMeta") === "true"
    const skipLineItems = requestUrl.searchParams.get("skipLineItems") === "true"

    // C-22 / X2: postgres is the only implemented PLAN_DETAIL branch.
    // Flag remains; `xano` → explicit 410 (no fan-out, no silent fallback).
    if (getPlanDetailBackend() === "xano") {
      return NextResponse.json(
        {
          error:
            "DATA_BACKEND_PLAN_DETAIL=xano is retired (X2). Use postgres (default).",
          code: "PLAN_DETAIL_XANO_GONE",
        },
        { status: 410 }
      )
    }

    const pgResult = await readMbaPlanDetailFromPostgres({
      mbaNumber: mba_number,
      requestedVersionNumber:
        requestedVersionNumber != null && !Number.isNaN(requestedVersionNumber)
          ? requestedVersionNumber
          : null,
      skipLineItems,
      includeVersionsMeta,
      billingScheduleFull,
      requestedStartDateParam,
      requestedEndDateParam,
    })
    if (!pgResult.ok) {
      return NextResponse.json(
        {
          error: pgResult.error,
          ...(pgResult.status === 500
            ? { code: PLAN_DETAIL_POSTGRES_ERROR_CODE }
            : {}),
        },
        { status: pgResult.status }
      )
    }
    const response = NextResponse.json(pgResult.data)
    response.headers.set("Cache-Control", "no-store, max-age=0")
    response.headers.set("x-plan-detail-backend", "postgres")
    return response
  } catch (error) {
    console.error("[api/mediaplans/mba/[mba_number] GET]", error)
    return NextResponse.json({ error: "Failed to fetch media plan" }, { status: 500 })
  }
}

// PUT is retired. The editor saves through POST /api/plans/save.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ mba_number: string }> }
) {
  const { mba_number: rawMbaNumber } = await params
  const mba_number = parseMbaNumber(rawMbaNumber)
  if (!mba_number) return invalidMbaNumberResponse()

  const access = await checkClientMbaAccess(request, mba_number)
  if (!access.ok) return access.response

  return NextResponse.json(
    {
      error: "MBA PUT is retired. The editor saves through POST /api/plans/save.",
      path: `/api/mediaplans/mba/${mba_number}`,
    },
    { status: 410 },
  )
}

// PATCH updates the Postgres media_plan_masters row (and the publish stamp).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ mba_number: string }> }
) {
  try {
    const { mba_number: rawMbaNumber } = await params
    const mba_number = parseMbaNumber(rawMbaNumber)
    if (!mba_number) return invalidMbaNumberResponse()

    const access = await checkClientMbaAccess(request, mba_number)
    if (!access.ok) return access.response

    const data = await request.json()
    const { readPlanMasterByMba, readPlanVersionsByMba } = await import("@/lib/data/readMediaPlans")
    const masterData = await readPlanMasterByMba(mba_number)
    if (!masterData) {
      return NextResponse.json(
        { error: `Media plan master not found for MBA number: ${mba_number}` },
        { status: 404 },
      )
    }

    const draftReturnRejection = getDraftReturnRejection(
      masterData.campaign_status,
      data.campaign_status ?? data.mp_campaignstatus,
    )
    if (draftReturnRejection) {
      return NextResponse.json(
        { error: draftReturnRejection.error },
        { status: draftReturnRejection.status },
      )
    }

    if (isPublishVersionAdvance(data)) {
      if (
        process.env.FORCE_FAIL_VERSION_PUBLISH === "1" &&
        process.env.NODE_ENV !== "production"
      ) {
        return NextResponse.json(
          { error: "Forced publish failure (FORCE_FAIL_VERSION_PUBLISH=1)" },
          { status: 500 },
        )
      }

      const targetPublishVersion = parseVersion(data.version_number)
      if (targetPublishVersion != null && targetPublishVersion > 0) {
        const integrity = await checkPublishLineItemIntegrity({
          mbaNumber: mba_number,
          targetVersionNumber: targetPublishVersion,
          fetchVersionRow: async (mba, versionNumber) => {
            const rows = await readPlanVersionsByMba(mba)
            return rows.find((row) => Number(row.version_number) === versionNumber) ?? null
          },
          countChildrenForChannels: countPublishIntegrityChildren,
        })
        if (!integrity.ok) {
          return NextResponse.json({ error: integrity.error }, { status: integrity.status })
        }
      }
    }

    const { eq, sql } = await import("drizzle-orm")
    const { getDb, schema } = await import("@/db")
    const { dollarsToCampaignBudgetCents } = await import("@/lib/mediaplan/buildPostgresSavePayload")
    const db = getDb()
    const patch: Record<string, unknown> = {}
    if (data.mp_campaignname !== undefined) patch.campaignName = data.mp_campaignname
    if (data.campaign_status !== undefined) patch.campaignStatus = data.campaign_status
    if (data.campaign_start_date !== undefined) {
      patch.campaignStartDate = data.campaign_start_date
        ? toMelbourneDateString(data.campaign_start_date)
        : data.campaign_start_date
    }
    if (data.campaign_end_date !== undefined) {
      patch.campaignEndDate = data.campaign_end_date
        ? toMelbourneDateString(data.campaign_end_date)
        : data.campaign_end_date
    }
    if (data.mp_campaignbudget !== undefined) {
      patch.campaignBudgetCents = dollarsToCampaignBudgetCents(data.mp_campaignbudget)
    }

    if (Object.keys(patch).length > 0) {
      await db
        .update(schema.mediaPlanMasters)
        .set(patch)
        .where(sql`lower(${schema.mediaPlanMasters.mbaNumber}) = ${mba_number.trim().toLowerCase()}`)
    }

    if (isPublishVersionAdvance(data)) {
      const targetPublishVersion = parseVersion(data.version_number)
      if (targetPublishVersion != null && targetPublishVersion > 0) {
        const actor = await getCurrentUser(request)
        const stamped = await stampVersionPublicationByMbaVersion({
          mbaNumber: mba_number,
          versionNumber: targetPublishVersion,
          publishedByEmail: normalisePublishedByEmail(actor?.email ?? null),
        })
        if (stamped.versionId != null) {
          await db
            .update(schema.mediaPlanMasters)
            .set({ publishedVersionId: stamped.versionId })
            .where(eq(schema.mediaPlanMasters.id, Number(masterData.id)))
        }
      }
    }

    const updated = await readPlanMasterByMba(mba_number)
    return NextResponse.json(updated ?? masterData)
  } catch (error) {
    console.error("[api/mediaplans/mba/[mba_number] PATCH] unexpected error", error)
    return NextResponse.json({ error: "Failed to update media plan master" }, { status: 500 })
  }
}
