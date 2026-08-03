/**
 * Shared MBA GET response assembly (master ∪ version ∪ lineItems ∪ metrics).
 * Used by the Postgres plan-detail path; Xano route keeps its inline copy until
 * cutover so postgres `readMbaPlanDetail` stays shape-compatible with edit consumers.
 */

import { parseDateSafe as safeParseDate } from "@/lib/dates/parseDateSafe"
import { parseDateOnlyString, toMelbourneDateString } from "@/lib/timezone"
import { expectedSpendToDateFromDeliveryScheduleMonthly } from "@/lib/spend/monthlyPlanCalendar"

export type MbaGetMediaLineItems = {
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

export const MBA_GET_LINE_ITEM_KEYS = [
  "television",
  "radio",
  "newspaper",
  "magazines",
  "ooh",
  "cinema",
  "search",
  "socialMedia",
  "digitalDisplay",
  "digitalAudio",
  "digitalVideo",
  "bvod",
  "integration",
  "progDisplay",
  "progVideo",
  "progBvod",
  "progAudio",
  "progOoh",
  "influencers",
  "production",
] as const satisfies ReadonlyArray<keyof MbaGetMediaLineItems>

export function createEmptyMbaGetLineItems(): MbaGetMediaLineItems {
  return {
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
    production: [],
  }
}

const MEDIA_TYPE_FLAGS: Record<keyof MbaGetMediaLineItems, string> = {
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

const MEDIA_TYPE_ALIASES: Record<string, keyof MbaGetMediaLineItems> = {
  "social media": "socialMedia",
  socialmedia: "socialMedia",
  social: "socialMedia",
  "digital display": "digitalDisplay",
  digitaldisplay: "digitalDisplay",
  "digital audio": "digitalAudio",
  digitalaudio: "digitalAudio",
  "digital video": "digitalVideo",
  digitalvideo: "digitalVideo",
  "programmatic display": "progDisplay",
  "prog display": "progDisplay",
  progdisplay: "progDisplay",
  "programmatic video": "progVideo",
  "prog video": "progVideo",
  progvideo: "progVideo",
  "programmatic bvod": "progBvod",
  "prog bvod": "progBvod",
  progbvod: "progBvod",
  "programmatic audio": "progAudio",
  "prog audio": "progAudio",
  progaudio: "progAudio",
  "programmatic ooh": "progOoh",
  "prog ooh": "progOoh",
  progooh: "progOoh",
  integrations: "integration",
  digi_display: "digitalDisplay",
  digi_audio: "digitalAudio",
  digi_video: "digitalVideo",
  digi_bvod: "bvod",
}

function normalise(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
}

export function parseMbaGetVersion(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const num = typeof value === "string" ? parseInt(value, 10) : Number(value)
  return Number.isNaN(num) ? null : num
}

function parseAmount(value: unknown): number {
  if (value === null || value === undefined) return 0
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]+/g, "")
    const parsed = parseFloat(cleaned)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function normalizeISODateOnlySafe(value: unknown): string | null {
  if (!value) return null
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
    const parsed = safeParseDate(trimmed)
    return parsed ? toMelbourneDateString(parsed) : null
  }
  const parsed = safeParseDate(value)
  return parsed ? toMelbourneDateString(parsed) : null
}

function clampISODateOnly(
  value: string | null,
  min: string | null,
  max: string | null
): string | null {
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
  const { campaignStartISO, campaignEndISO, requestedStartISO, requestedEndISO } =
    opts
  const startClamped =
    clampISODateOnly(requestedStartISO, campaignStartISO, campaignEndISO) ??
    campaignStartISO
  const endClamped =
    clampISODateOnly(requestedEndISO, campaignStartISO, campaignEndISO) ??
    campaignEndISO
  if (startClamped && endClamped && startClamped > endClamped) {
    return { startISO: endClamped, endISO: startClamped }
  }
  return { startISO: startClamped, endISO: endClamped }
}

function getMonthLabel(value: unknown): string {
  if (!value) return "Unknown"
  const date = new Date(value as string | number | Date)
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric" })
  }
  return String(value)
}

function calculateTimeElapsed(startDate: string, endDate: string): number {
  const start = parseDateOnlyString(startDate)
  const end = parseDateOnlyString(endDate)
  if (!start || !end) return 0
  const now = new Date()
  const total = end.getTime() - start.getTime()
  if (total <= 0) return 100
  const elapsed = now.getTime() - start.getTime()
  if (elapsed <= 0) return 0
  if (elapsed >= total) return 100
  return Math.round((elapsed / total) * 1000) / 10
}

function calculateDayMetrics(startDate: string, endDate: string) {
  const start = parseDateOnlyString(startDate)
  const end = parseDateOnlyString(endDate)
  if (!start || !end) {
    return { daysInCampaign: 0, daysElapsed: 0, daysRemaining: 0 }
  }
  const msDay = 24 * 60 * 60 * 1000
  const daysInCampaign = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / msDay) + 1
  )
  const now = new Date()
  const daysElapsed = Math.min(
    daysInCampaign,
    Math.max(0, Math.round((now.getTime() - start.getTime()) / msDay) + 1)
  )
  return {
    daysInCampaign,
    daysElapsed,
    daysRemaining: Math.max(0, daysInCampaign - daysElapsed),
  }
}

function startOfDay(date: Date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(date: Date) {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

function overlapsRange(
  itemStart: Date,
  itemEnd: Date,
  rangeStart: Date,
  rangeEnd: Date
): boolean {
  return itemStart <= rangeEnd && itemEnd >= rangeStart
}

function filterBillingScheduleByRange(
  billingSchedule: any[],
  rangeStart: Date,
  rangeEnd: Date
): any[] {
  const rs = startOfDay(rangeStart)
  const re = endOfDay(rangeEnd)
  return billingSchedule.filter((entry) => {
    const raw =
      entry?.month ||
      entry?.monthYear ||
      entry?.billingMonth ||
      entry?.billing_month ||
      entry?.period_start ||
      entry?.periodStart ||
      entry?.date
    const d = raw ? new Date(raw) : null
    if (!d || Number.isNaN(d.getTime())) return true
    return overlapsRange(startOfDay(d), endOfDay(d), rs, re)
  })
}

function filterDeliveryScheduleByRange(
  deliverySchedule: any[],
  rangeStart: Date,
  rangeEnd: Date
): any[] {
  const rs = startOfDay(rangeStart)
  const re = endOfDay(rangeEnd)
  return deliverySchedule.filter((entry) => {
    const raw =
      entry?.month ||
      entry?.monthYear ||
      entry?.billingMonth ||
      entry?.billing_month ||
      entry?.period_start ||
      entry?.periodStart ||
      entry?.date ||
      entry?.startDate
    const d = raw ? new Date(raw) : null
    if (!d || Number.isNaN(d.getTime())) return true
    return overlapsRange(startOfDay(d), endOfDay(d), rs, re)
  })
}

function extractLineItemDateRange(item: any): {
  start: Date | null
  end: Date | null
} {
  const startRaw =
    item?.start_date ||
    item?.startDate ||
    item?.flight_start ||
    item?.campaign_start_date
  const endRaw =
    item?.end_date ||
    item?.endDate ||
    item?.flight_end ||
    item?.campaign_end_date
  const start = startRaw ? new Date(startRaw) : null
  const end = endRaw ? new Date(endRaw) : null
  return {
    start: start && !Number.isNaN(start.getTime()) ? start : null,
    end: end && !Number.isNaN(end.getTime()) ? end : null,
  }
}

function filterLineItemsDataByRange(
  lineItems: MbaGetMediaLineItems,
  rangeStart: Date,
  rangeEnd: Date
): MbaGetMediaLineItems {
  const rs = startOfDay(rangeStart)
  const re = endOfDay(rangeEnd)
  const out = createEmptyMbaGetLineItems()
  for (const key of MBA_GET_LINE_ITEM_KEYS) {
    out[key] = (lineItems[key] ?? []).filter((item) => {
      const { start, end } = extractLineItemDateRange(item)
      if (!start && !end) return true
      const s = start ?? end!
      const e = end ?? start!
      return overlapsRange(startOfDay(s), endOfDay(e), rs, re)
    })
  }
  return out
}

function summarizeBillingSchedule(billingSchedule: any[]): {
  spendByMediaChannel: Array<{ mediaType: string; amount: number; percentage: number }>
  monthlySpend: Array<{ month: string; data: Array<{ mediaType: string; amount: number }> }>
} {
  const spendByChannel: Record<string, number> = {}
  const monthlyMap: Record<string, Record<string, number>> = {}

  billingSchedule.forEach((entry: any) => {
    const channel =
      entry?.channel ||
      entry?.media_channel ||
      entry?.mediaType ||
      entry?.media_type ||
      "Other"
    const monthLabel = getMonthLabel(
      entry?.month ||
        entry?.monthYear ||
        entry?.billingMonth ||
        entry?.billing_month ||
        entry?.period_start ||
        entry?.periodStart ||
        entry?.date
    )
    const amount = parseAmount(
      entry?.spend ??
        entry?.amount ??
        entry?.budget ??
        entry?.value ??
        entry?.investment ??
        entry?.media_investment ??
        entry?.total
    )
    if (amount > 0) {
      spendByChannel[channel] = (spendByChannel[channel] || 0) + amount
      monthlyMap[monthLabel] = monthlyMap[monthLabel] || {}
      monthlyMap[monthLabel][channel] =
        (monthlyMap[monthLabel][channel] || 0) + amount
    }
  })

  const monthlySpend = Object.entries(monthlyMap)
    .map(([month, data]) => ({
      month,
      data: Object.entries(data).map(([mediaType, amount]) => ({
        mediaType,
        amount,
      })),
    }))
    .sort((a, b) => {
      const aDate = new Date(a.month).getTime()
      const bDate = new Date(b.month).getTime()
      if (Number.isNaN(aDate) || Number.isNaN(bDate)) {
        return a.month.localeCompare(b.month)
      }
      return aDate - bDate
    })

  const total = Object.values(spendByChannel).reduce((sum, v) => sum + v, 0)
  const spendByMediaChannel = Object.entries(spendByChannel).map(
    ([mediaType, amount]) => ({
      mediaType,
      amount,
      percentage: total > 0 ? (amount / total) * 100 : 0,
    })
  )
  return { spendByMediaChannel, monthlySpend }
}

function normalizeDeliverySchedule(raw: unknown) {
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
      : raw && typeof raw === "object" && Array.isArray((raw as { months?: unknown }).months)
        ? ((raw as { months: any[] }).months)
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
      monthlyMap[monthLabel][channel] =
        (monthlyMap[monthLabel][channel] || 0) + amount
    }
  })

  const monthlySpend = Object.entries(monthlyMap)
    .map(([month, data]) => ({
      month,
      data: Object.entries(data).map(([mediaType, amount]) => ({
        mediaType,
        amount,
      })),
    }))
    .sort((a, b) => {
      const aDate = new Date(a.month).getTime()
      const bDate = new Date(b.month).getTime()
      if (Number.isNaN(aDate) || Number.isNaN(bDate)) {
        return a.month.localeCompare(b.month)
      }
      return aDate - bDate
    })

  const total = Object.values(spendByChannel).reduce((sum, v) => sum + v, 0)
  const spendByMediaChannel = Object.entries(spendByChannel).map(
    ([mediaType, amount]) => ({
      mediaType,
      amount,
      percentage: total > 0 ? (amount / total) * 100 : 0,
    })
  )

  return { raw: parsed, spendByMediaChannel, monthlySpend }
}

function normalizeMediaTypeKey(raw: unknown): keyof MbaGetMediaLineItems | null {
  if (raw === null || raw === undefined) return null
  const trimmed = String(raw).trim()
  if (!trimmed) return null
  if ((MBA_GET_LINE_ITEM_KEYS as readonly string[]).includes(trimmed)) {
    return trimmed as keyof MbaGetMediaLineItems
  }
  const normalized = normalise(trimmed).replace(/[^a-z0-9]+/g, " ").trim()
  if ((MBA_GET_LINE_ITEM_KEYS as readonly string[]).includes(normalized)) {
    return normalized as keyof MbaGetMediaLineItems
  }
  return MEDIA_TYPE_ALIASES[normalized] || null
}

function flagIsEnabled(value: unknown): boolean {
  if (value === true) return true
  if (value === 1) return true
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    return normalized === "true" || normalized === "1" || normalized === "yes"
  }
  return false
}

export function deriveEnabledMediaTypes(
  versionData: Record<string, unknown> = {}
): Array<keyof MbaGetMediaLineItems> {
  const enabledSet = new Set<keyof MbaGetMediaLineItems>()
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

  ;(Object.keys(MEDIA_TYPE_FLAGS) as Array<keyof MbaGetMediaLineItems>).forEach(
    (key) => {
      const flag = MEDIA_TYPE_FLAGS[key]
      if (flagIsEnabled(versionData?.[flag])) {
        enabledSet.add(key)
      }
    }
  )

  const enabled = Array.from(enabledSet)
  return enabled.length > 0 ? enabled : [...MBA_GET_LINE_ITEM_KEYS]
}

function coerceScheduleArray(raw: unknown): unknown {
  let parsed = raw
  if (typeof raw === "string" && raw.trim() !== "") {
    try {
      parsed = JSON.parse(raw)
    } catch {
      return raw
    }
  }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const inner = (parsed as { months?: unknown }).months
    if (Array.isArray(inner)) return inner
  }
  return parsed
}

export type MbaGetAssembleInput = {
  mbaNumber: string
  masterData: Record<string, unknown>
  versionData: Record<string, unknown>
  lineItemsData: MbaGetMediaLineItems
  versionsMetadata: Array<{ id: unknown; version_number: number; created_at: unknown }>
  /** Published watermark (master.version_number). */
  latestVersionNumber: number
  /**
   * Next save version. Postgres path: tip+1 (O4.6). Xano path historically
   * used published+1 — intentional difference when staged > published exist.
   */
  nextVersionNumber: number
  targetVersionNumber: number
  billingScheduleFull?: boolean
  requestedStartDateParam?: string | null
  requestedEndDateParam?: string | null
  clientBrandColour?: string | null
}

/**
 * Build the flat MBA GET JSON (same field contract as the Xano route).
 */
export function assembleMbaGetCombinedData(
  input: MbaGetAssembleInput
): Record<string, unknown> {
  const {
    mbaNumber,
    masterData,
    versionData,
    versionsMetadata,
    latestVersionNumber,
    nextVersionNumber,
    targetVersionNumber,
    billingScheduleFull = false,
    requestedStartDateParam = null,
    requestedEndDateParam = null,
    clientBrandColour = null,
  } = input

  let lineItemsData = input.lineItemsData
  const enabledMediaTypes = deriveEnabledMediaTypes(versionData)

  const billingSchedule =
    versionData.billingSchedule ||
    versionData.billing_schedule ||
    masterData.billingSchedule ||
    masterData.billing_schedule ||
    null
  const parsedBillingSchedule = coerceScheduleArray(billingSchedule)

  const deliveryScheduleSource =
    versionData.deliverySchedule ||
    versionData.delivery_schedule ||
    masterData.deliverySchedule ||
    masterData.delivery_schedule ||
    null
  const parsedDeliverySchedule = coerceScheduleArray(deliveryScheduleSource)

  const startDate =
    versionData.campaign_start_date ||
    versionData.mp_campaigndates_start ||
    masterData.campaign_start_date ||
    masterData.mp_campaigndates_start
  const endDate =
    versionData.campaign_end_date ||
    versionData.mp_campaigndates_end ||
    masterData.campaign_end_date ||
    masterData.mp_campaigndates_end

  const campaignStartISO = normalizeISODateOnlySafe(startDate)
  const campaignEndISO = normalizeISODateOnlySafe(endDate)
  const { startISO: effectiveStartISO, endISO: effectiveEndISO } =
    computeEffectiveDateRange({
      campaignStartISO,
      campaignEndISO,
      requestedStartISO: normalizeISODateOnlySafe(requestedStartDateParam),
      requestedEndISO: normalizeISODateOnlySafe(requestedEndDateParam),
    })

  const effectiveStartForMetrics = effectiveStartISO ?? campaignStartISO
  const effectiveEndForMetrics = effectiveEndISO ?? campaignEndISO

  const timeElapsed =
    effectiveStartForMetrics && effectiveEndForMetrics
      ? calculateTimeElapsed(effectiveStartForMetrics, effectiveEndForMetrics)
      : 0
  const dayMetrics =
    effectiveStartForMetrics && effectiveEndForMetrics
      ? calculateDayMetrics(effectiveStartForMetrics, effectiveEndForMetrics)
      : { daysInCampaign: 0, daysElapsed: 0, daysRemaining: 0 }

  const clientName =
    versionData?.mp_client_name ||
    versionData?.client_name ||
    masterData?.mp_client_name ||
    masterData?.client_name ||
    null

  let effectiveStartDateObj: Date | null = null
  let effectiveEndDateObj: Date | null = null
  if (effectiveStartForMetrics && effectiveEndForMetrics) {
    effectiveStartDateObj = parseDateOnlyString(effectiveStartForMetrics)
    effectiveEndDateObj = parseDateOnlyString(effectiveEndForMetrics)
  }

  const filteredBillingSchedule =
    parsedBillingSchedule &&
    Array.isArray(parsedBillingSchedule) &&
    effectiveStartDateObj &&
    effectiveEndDateObj &&
    !billingScheduleFull
      ? filterBillingScheduleByRange(
          parsedBillingSchedule,
          effectiveStartDateObj,
          effectiveEndDateObj
        )
      : parsedBillingSchedule

  const billingSpend =
    filteredBillingSchedule && Array.isArray(filteredBillingSchedule)
      ? summarizeBillingSchedule(filteredBillingSchedule)
      : { spendByMediaChannel: [], monthlySpend: [] }

  const filteredDeliverySchedule =
    parsedDeliverySchedule &&
    Array.isArray(parsedDeliverySchedule) &&
    effectiveStartDateObj &&
    effectiveEndDateObj
      ? filterDeliveryScheduleByRange(
          parsedDeliverySchedule,
          effectiveStartDateObj,
          effectiveEndDateObj
        )
      : parsedDeliverySchedule

  const deliveryScheduleMetrics = normalizeDeliverySchedule(
    filteredDeliverySchedule
  )

  if (effectiveStartDateObj && effectiveEndDateObj) {
    lineItemsData = filterLineItemsDataByRange(
      lineItemsData,
      effectiveStartDateObj,
      effectiveEndDateObj
    )
  }

  const countsPerType = Object.entries(lineItemsData).reduce(
    (acc, [key, items]) => {
      acc[key] = Array.isArray(items) ? items.length : 0
      return acc
    },
    {} as Record<string, number>
  )

  const startForExpectedSpend =
    effectiveStartForMetrics || normalizeISODateOnlySafe(startDate)
  const endForExpectedSpend =
    effectiveEndForMetrics || normalizeISODateOnlySafe(endDate)

  const expectedSpendToDate =
    startForExpectedSpend && endForExpectedSpend
      ? expectedSpendToDateFromDeliveryScheduleMonthly(filteredDeliverySchedule, {
          campaignStartISO: startForExpectedSpend,
          campaignEndISO: endForExpectedSpend,
        })
      : 0

  const actualVersionNumber = targetVersionNumber

  const combinedData: Record<string, unknown> = {
    ...masterData,
    ...versionData,
    mbaNumber,
    versionNumber: actualVersionNumber,
    versionData,
    version_number: actualVersionNumber,
    billingSchedule: filteredBillingSchedule,
    deliverySchedule: deliveryScheduleMetrics.raw,
    lineItems: lineItemsData,
    metrics: {
      timeElapsed,
      ...dayMetrics,
      expectedSpendToDate,
      spendByMediaChannel: billingSpend.spendByMediaChannel,
      monthlySpend: billingSpend.monthlySpend,
      deliverySpendByChannel: deliveryScheduleMetrics.spendByMediaChannel,
      deliveryMonthlySpend: deliveryScheduleMetrics.monthlySpend,
    },
    debug: {
      enabledMediaTypes,
      countsPerType,
    },
    client: {
      ...((versionData?.client || masterData?.client || {}) as object),
      brand_colour:
        clientBrandColour ||
        (versionData?.client as { brand_colour?: string } | undefined)
          ?.brand_colour ||
        (masterData?.client as { brand_colour?: string } | undefined)
          ?.brand_colour,
      brandColour:
        clientBrandColour ||
        (versionData?.client as { brandColour?: string } | undefined)
          ?.brandColour ||
        (masterData?.client as { brandColour?: string } | undefined)?.brandColour,
      name:
        clientName ||
        (versionData?.client as { name?: string } | undefined)?.name ||
        (masterData?.client as { name?: string } | undefined)?.name,
    },
    client_details: {
      ...((versionData?.client_details ||
        versionData?.clientDetails ||
        masterData?.client_details ||
        masterData?.clientDetails ||
        {}) as object),
      brand_colour:
        clientBrandColour ||
        (versionData?.client_details as { brand_colour?: string } | undefined)
          ?.brand_colour ||
        (versionData?.clientDetails as { brand_colour?: string } | undefined)
          ?.brand_colour ||
        (masterData?.client_details as { brand_colour?: string } | undefined)
          ?.brand_colour ||
        (masterData?.clientDetails as { brand_colour?: string } | undefined)
          ?.brand_colour,
    },
    versions: [...versionsMetadata].sort(
      (a, b) => (a.version_number || 0) - (b.version_number || 0)
    ),
    latestVersionNumber,
    nextVersionNumber,
    media_plan_master_id: masterData.id,
  }

  if (clientBrandColour) {
    combinedData.brand_colour = combinedData.brand_colour || clientBrandColour
    combinedData.client_brand_colour =
      combinedData.client_brand_colour || clientBrandColour
  }

  return combinedData
}
