import { NextRequest, NextResponse } from "next/server"
import { checkClientMbaAccess } from "@/lib/auth/checkClientMbaAccess"
import axios from "axios"
import { parseDateSafe as safeParseDate } from "@/lib/dates/parseDateSafe"
import { parseDateOnlyString, toMelbourneDateString } from "@/lib/timezone"
import { fetchAllXanoPages } from "@/lib/api/xanoPagination"
import { getXanoBaseUrl, parseXanoListPayload, xanoAuthHeaderRecord, xanoPostHeaderRecord, xanoUrl } from "@/lib/api/xano"
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

const MEDIA_TYPE_ENDPOINTS: Record<keyof MediaLineItems, string> = {
  television: "media_plan_television",
  radio: "media_plan_radio",
  newspaper: "media_plan_newspaper",
  magazines: "media_plan_magazines",
  ooh: "media_plan_ooh",
  cinema: "media_plan_cinema",
  digitalDisplay: "media_plan_digi_display",
  digitalAudio: "media_plan_digi_audio",
  digitalVideo: "media_plan_digi_video",
  bvod: "media_plan_digi_bvod",
  integration: "media_plan_integrations",
  search: "media_plan_search",
  socialMedia: "media_plan_social",
  progDisplay: "media_plan_prog_display",
  progVideo: "media_plan_prog_video",
  progBvod: "media_plan_prog_bvod",
  progAudio: "media_plan_prog_audio",
  progOoh: "media_plan_prog_ooh",
  influencers: "media_plan_influencers",
  production: "media_plan_production",
}

const MEDIA_TYPE_FLAGS: Record<keyof MediaLineItems, string> = {
  television: "mp_television",
  radio: "mp_radio",
  newspaper: "mp_newspaper",
  magazines: "mp_magazines",
  ooh: "mp_ooh",
  cinema: "mp_cinema",
  digitalDisplay: "mp_digidisplay",
  digitalAudio: "mp_digiaudio",
  digitalVideo: "mp_digivideo",
  bvod: "mp_bvod",
  integration: "mp_integration",
  search: "mp_search",
  socialMedia: "mp_socialmedia",
  progDisplay: "mp_progdisplay",
  progVideo: "mp_progvideo",
  progBvod: "mp_progbvod",
  progAudio: "mp_progaudio",
  progOoh: "mp_progooh",
  influencers: "mp_influencers",
  production: "mp_production",
}

const MEDIA_TYPE_ALIASES: Record<string, keyof MediaLineItems> = {
  "social media": "socialMedia",
  "socialmedia": "socialMedia",
  "social": "socialMedia",
  "digital display": "digitalDisplay",
  "digitaldisplay": "digitalDisplay",
  "digital audio": "digitalAudio",
  "digitalaudio": "digitalAudio",
  "digital video": "digitalVideo",
  "digitalvideo": "digitalVideo",
  "programmatic display": "progDisplay",
  "prog display": "progDisplay",
  "progdisplay": "progDisplay",
  "programmatic video": "progVideo",
  "prog video": "progVideo",
  "progvideo": "progVideo",
  "programmatic bvod": "progBvod",
  "prog bvod": "progBvod",
  "progbvod": "progBvod",
  "programmatic audio": "progAudio",
  "prog audio": "progAudio",
  "progaudio": "progAudio",
  "programmatic ooh": "progOoh",
  "prog ooh": "progOoh",
  "progooh": "progOoh",
}

function normalise(value: any) {
  return String(value ?? "").trim().toLowerCase()
}

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

function normalizeMediaTypeKey(raw: any): keyof MediaLineItems | null {
  if (raw === null || raw === undefined) return null
  const trimmed = String(raw).trim()
  if (!trimmed) return null
  if (trimmed in MEDIA_TYPE_ENDPOINTS) return trimmed as keyof MediaLineItems
  const normalized = normalise(trimmed).replace(/[^a-z0-9]+/g, " ").trim()
  if (normalized in MEDIA_TYPE_ENDPOINTS) return normalized as keyof MediaLineItems
  return MEDIA_TYPE_ALIASES[normalized] || null
}

function flagIsEnabled(value: any): boolean {
  if (value === true) return true
  if (value === 1) return true
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    return normalized === "true" || normalized === "1" || normalized === "yes"
  }
  return false
}

function deriveEnabledMediaTypes(versionData: Record<string, any> = {}) {
  const enabledSet = new Set<keyof MediaLineItems>()
  const arrayCandidates = [
    versionData?.enabledMediaTypes,
    versionData?.enabled_media_types,
    versionData?.media_types,
    versionData?.mediaTypes,
  ]
  arrayCandidates.forEach((candidate) => {
    if (Array.isArray(candidate)) {
      candidate.forEach((entry) => {
        const normalized = normalizeMediaTypeKey(entry)
        if (normalized) enabledSet.add(normalized)
      })
    }
  })

  ;(Object.keys(MEDIA_TYPE_FLAGS) as Array<keyof MediaLineItems>).forEach((key) => {
    const flag = MEDIA_TYPE_FLAGS[key]
    if (flagIsEnabled(versionData?.[flag])) {
      enabledSet.add(key)
    }
  })

  const enabled = Array.from(enabledSet)
  return enabled.length > 0 ? enabled : (Object.keys(MEDIA_TYPE_ENDPOINTS) as Array<keyof MediaLineItems>)
}

function filterByMbaAndVersion(
  items: any[],
  mbaNumber: string,
  versionNumber: number,
  mediaPlanVersionId?: number | null
): any[] {
  if (!Array.isArray(items)) return []
  const normalizedMba = normalise(mbaNumber)
  const versionStr = String(versionNumber)
  const versionIdStr =
    mediaPlanVersionId !== null && mediaPlanVersionId !== undefined
      ? String(mediaPlanVersionId)
      : null

  return items.filter((item) => {
    if (normalise(item?.mba_number) !== normalizedMba) return false

    const mpPlanNumber = item?.mp_plannumber ?? item?.mp_plan_number ?? item?.mpPlanNumber
    const mediaPlanVersion = item?.media_plan_version
    const mediaPlanVersionId = item?.media_plan_version_id ?? item?.media_plan_versionID
    const versionNumberField = item?.version_number

    const hasVersionIdCandidate =
      (mediaPlanVersion !== null && mediaPlanVersion !== undefined && String(mediaPlanVersion).trim() !== "") ||
      (mediaPlanVersionId !== null && mediaPlanVersionId !== undefined && String(mediaPlanVersionId).trim() !== "")

    // If we know the media_plan_versions.id, prefer matching by that foreign key when present.
    // This prevents mp_plannumber/version_number mismatches from pulling in unrelated rows.
    if (versionIdStr && hasVersionIdCandidate) {
      const candidates = [mediaPlanVersion, mediaPlanVersionId]
      return candidates.some((value) => String(value ?? "").trim() === versionIdStr)
    }

    // Fallback for legacy rows without a version-id FK:
    // match by version_number/mp_plannumber fields.
    const versionCandidates = [mpPlanNumber, versionNumberField]
    return versionCandidates.some((value) => String(value ?? "").trim() === versionStr)
  })
}

async function fetchXanoTableForMediaType(
  mediaType: keyof MediaLineItems,
  mbaNumber: string,
  versionNumber: number,
  mediaPlanVersionId?: number | null
): Promise<any[]> {
  const endpoint = MEDIA_TYPE_ENDPOINTS[mediaType]
  const url = xanoUrl(endpoint, ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])

  // IMPORTANT:
  // Query Xano with BOTH mba_number + a version-scoping parameter to avoid scanning
  // all historic versions and filtering in-memory.
  //
  // Different media tables use different version fields, so we try a small fallback chain.
  const attempts: Array<Record<string, string | number | boolean | null | undefined>> = [
    // Best: filter by the media_plan_versions primary key (foreign-key relationship).
    ...(mediaPlanVersionId !== null && mediaPlanVersionId !== undefined
      ? [
          { mba_number: mbaNumber, media_plan_version: mediaPlanVersionId },
          { mba_number: mbaNumber, media_plan_version_id: mediaPlanVersionId },
        ]
      : []),
    // Next best: filter by the human-visible version number (legacy fields).
    { mba_number: mbaNumber, mp_plannumber: versionNumber },
    { mba_number: mbaNumber, version_number: versionNumber },
    // Some older tables may store the version number in media_plan_version directly.
    { mba_number: mbaNumber, media_plan_version: versionNumber },
  ]

  let bestFiltered: any[] = []
  let bestRawCount = Number.POSITIVE_INFINITY

  for (const params of attempts) {
    const raw = await fetchAllXanoPages(url, params, `MBA_${mediaType}`)
    const filtered = filterByMbaAndVersion(raw, mbaNumber, versionNumber, mediaPlanVersionId)

    // Prefer attempts that return the most matching rows; tie-break by smallest raw payload.
    if (
      filtered.length > bestFiltered.length ||
      (filtered.length === bestFiltered.length && raw.length < bestRawCount)
    ) {
      bestFiltered = filtered
      bestRawCount = raw.length
    }

    // If the server-side filter worked (payload is already version-scoped), stop early.
    if (raw.length > 0 && raw.length === filtered.length) {
      break
    }
  }

  return bestFiltered
}

/**
 * After channel rows exist for a version id, detect duplicate line_item_id stamps
 * (rows > distinct line_item_ids). Used as a draft-save integrity signal.
 */
async function detectDuplicateLineItemWarning(
  mbaNumber: string,
  versionNumber: number,
  mediaPlanVersionId: number | null | undefined,
  versionData: any
): Promise<{
  channels: Array<{ channel: string; rows: number; distinctLineItemIds: number }>
} | null> {
  if (mediaPlanVersionId == null) return null

  const enabled = deriveEnabledMediaTypes(versionData)
  const channels: Array<{ channel: string; rows: number; distinctLineItemIds: number }> = []

  await Promise.all(
    enabled.map(async (mediaType) => {
      try {
        const rows = await fetchXanoTableForMediaType(
          mediaType,
          mbaNumber,
          versionNumber,
          mediaPlanVersionId
        )
        const versionScoped = rows.filter((row) => {
          const raw = row?.media_plan_version
          if (raw === undefined || raw === null || String(raw).trim() === "") return false
          return Number(raw) === Number(mediaPlanVersionId)
        })
        if (versionScoped.length === 0) return

        const distinct = new Set(
          versionScoped
            .map((row) => String(row?.line_item_id ?? row?.lineItemId ?? "").trim())
            .filter(Boolean)
        )
        if (versionScoped.length > distinct.size) {
          channels.push({
            channel: mediaType,
            rows: versionScoped.length,
            distinctLineItemIds: distinct.size,
          })
        }
      } catch (error) {
        console.warn(`[mba-put] duplicate check failed for ${mediaType}`, error)
      }
    })
  )

  if (channels.length === 0) return null
  return { channels }
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
