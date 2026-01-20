import { NextResponse } from "next/server"
import axios from "axios"
import { fetchAllMediaContainerLineItems, MEDIA_CONTAINER_ENDPOINTS } from "@/lib/api/media-containers"
import { filterLineItemsByPlanNumber } from "@/lib/api/mediaPlanVersionHelper"
import { normalizeCampaignLineItems } from "@/lib/mediaplan/normalizeCampaignLineItems"
import { xanoUrl } from "@/lib/api/xano"

export const dynamic = "force-dynamic"

const isDev = process.env.NODE_ENV !== "production"

const CANONICAL_MEDIA_KEYS: Array<keyof typeof MEDIA_CONTAINER_ENDPOINTS | "consulting"> = [
  "search",
  "socialMedia",
  "progDisplay",
  "progVideo",
  "progBvod",
  "progAudio",
  "progOoh",
  "television",
  "radio",
  "newspaper",
  "magazines",
  "ooh",
  "cinema",
  "bvod",
  "digitalDisplay",
  "digitalAudio",
  "digitalVideo",
  "integration",
  "influencers",
  "production",
  "consulting",
]

const CANONICAL_TO_FETCH_MAP: Record<typeof CANONICAL_MEDIA_KEYS[number], keyof typeof MEDIA_CONTAINER_ENDPOINTS> = {
  search: "search",
  socialMedia: "socialMedia",
  progDisplay: "progDisplay",
  progVideo: "progVideo",
  progBvod: "progBvod",
  progAudio: "progAudio",
  progOoh: "progOoh",
  television: "television",
  radio: "radio",
  newspaper: "newspaper",
  magazines: "magazines",
  ooh: "ooh",
  cinema: "cinema",
  bvod: "bvod",
  digitalDisplay: "digitalDisplay",
  digitalAudio: "digitalAudio",
  digitalVideo: "digitalVideo",
  integration: "integration",
  influencers: "influencers",
  production: "production",
  consulting: "production",
}

/**
 * Calculate campaign time elapsed as percentage
 */
function calculateTimeElapsed(startDate: string, endDate: string): number {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const today = new Date()
  
  // Set to start of day for accurate day calculations
  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  
  const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))
  const daysElapsed = Math.max(0, Math.ceil((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))
  
  // If today is after end date, return 100%
  if (today > end) {
    return 100
  }
  
  // If today is before start date, return 0%
  if (today < start) {
    return 0
  }
  
  const percentage = (daysElapsed / totalDays) * 100
  return Math.min(100, Math.max(0, Math.round(percentage * 100) / 100))
}

/**
 * Calculate expected spend to date from billing schedule
 */
function calculateExpectedSpendToDate(
  billingSchedule: any,
  startDate: string,
  endDate: string
): number {
  if (!billingSchedule || !Array.isArray(billingSchedule)) {
    return 0
  }

  const start = new Date(startDate)
  const end = new Date(endDate)
  const today = new Date()
  
  // Set to start of day
  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  
  // If today is before start date, return 0
  if (today < start) {
    return 0
  }
  
  // If today is after end date, sum all billing schedule amounts
  if (today > end) {
    return billingSchedule.reduce((sum: number, entry: any) => {
      if (entry.totalAmount) {
        const amount = parseFloat(String(entry.totalAmount).replace(/[^0-9.-]+/g, "")) || 0
        return sum + amount
      }
      // Also check for monthly amounts in mediaTypes
      if (entry.mediaTypes && Array.isArray(entry.mediaTypes)) {
        entry.mediaTypes.forEach((mt: any) => {
          if (mt.lineItems && Array.isArray(mt.lineItems)) {
            mt.lineItems.forEach((item: any) => {
              const amount = parseFloat(String(item.amount).replace(/[^0-9.-]+/g, "")) || 0
              sum += amount
            })
          }
        })
      }
      return sum
    }, 0)
  }
  
  // Calculate expected spend proportionally
  const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))
  const daysElapsed = Math.ceil((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  const proportion = Math.min(1, daysElapsed / totalDays)
  
  // Sum all expected amounts from billing schedule
  const totalExpected = billingSchedule.reduce((sum: number, entry: any) => {
    if (entry.totalAmount) {
      const amount = parseFloat(String(entry.totalAmount).replace(/[^0-9.-]+/g, "")) || 0
      return sum + amount
    }
    // Also check for monthly amounts in mediaTypes
    if (entry.mediaTypes && Array.isArray(entry.mediaTypes)) {
      entry.mediaTypes.forEach((mt: any) => {
        if (mt.lineItems && Array.isArray(mt.lineItems)) {
          mt.lineItems.forEach((item: any) => {
            const amount = parseFloat(String(item.amount).replace(/[^0-9.-]+/g, "")) || 0
            sum += amount
          })
        }
      })
    }
    return sum
  }, 0)
  
  return totalExpected * proportion
}

function calculateDayMetrics(startDate: string, endDate: string) {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const today = new Date()

  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)

  const daysInCampaign = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1)
  const daysElapsed = today < start ? 0 : Math.min(daysInCampaign, Math.ceil((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1)
  const daysRemaining = Math.max(0, daysInCampaign - daysElapsed)

  return { daysInCampaign, daysElapsed, daysRemaining }
}

// Safely parse a version number that might be a string or number
function parseVersionNumber(value: any): number | null {
  if (value === null || value === undefined) return null
  const num = typeof value === "string" ? parseInt(value, 10) : value
  return Number.isFinite(num) ? num : null
}

// Parse numeric values that may be stored as strings with currency symbols
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

// Derive a displayable month label (e.g., Jan 2025) from varied date/month fields
function getMonthLabel(value: any): string {
  if (!value) return "Unknown"
  const date = new Date(value)
  if (!isNaN(date.getTime())) {
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric" })
  }
  return String(value)
}

// Summarize billingSchedule into spend by channel and monthly breakdowns
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
    if (isNaN(aDate) || isNaN(bDate)) return a.month.localeCompare(b.month)
    return aDate - bDate
  })

  return { spendByMediaChannel, monthlySpend }
}

const MEDIA_TYPE_KEY_MAP: Record<string, string> = {
  "Digital Display": "digitalDisplay",
  "Digital Audio": "digitalAudio",
  "Digital Video": "digitalVideo",
  "Programmatic Display": "progDisplay",
  "Programmatic Video": "progVideo",
  "Programmatic BVOD": "progBvod",
  "Programmatic Audio": "progAudio",
  "Programmatic OOH": "progOoh",
  "BVOD": "bvod",
  "OOH": "ooh",
  "Television": "television",
  "Radio": "radio",
  "Newspaper": "newspaper",
  "Magazines": "magazines",
  "Cinema": "cinema",
  "Integration": "integration",
  "Search": "search",
  "Social Media": "socialMedia",
  "Influencers": "influencers"
}

function parseMonthRange(label: string | undefined) {
  if (!label) return null
  const parsed = new Date(`${label} 1`)
  if (isNaN(parsed.getTime())) return null
  const start = new Date(parsed.getFullYear(), parsed.getMonth(), 1)
  const end = new Date(parsed.getFullYear(), parsed.getMonth() + 1, 0)
  return { start, end }
}

function synthesizeLineItemsFromBilling(billingSchedule: any[]): Record<string, any[]> {
  const result: Record<string, any[]> = {}
  billingSchedule.forEach((monthEntry: any, monthIdx: number) => {
    const range = parseMonthRange(monthEntry?.monthYear || monthEntry?.month || monthEntry?.billingMonth)
    const startIso = range?.start?.toISOString()
    const endIso = range?.end?.toISOString()

    const mediaTypes = Array.isArray(monthEntry?.mediaTypes) ? monthEntry.mediaTypes : []
    mediaTypes.forEach((mt: any, mtIdx: number) => {
      const key = MEDIA_TYPE_KEY_MAP[mt?.mediaType] || mt?.mediaType || "other"
      result[key] = result[key] || []

      const items = Array.isArray(mt?.lineItems) ? mt.lineItems : []
      items.forEach((li: any, liIdx: number) => {
        const amount = parseAmount(li?.amount ?? li?.totalAmount)
        const burst = {
          startDate: startIso || "",
          endDate: endIso || startIso || "",
          budget: amount,
          deliverablesAmount: amount,
          deliverables: 0
        }
        result[key].push({
          market: li?.header1,
          placement: li?.header2,
          totalMedia: amount,
          bursts_json: JSON.stringify([burst]),
          start_date: startIso,
          end_date: endIso,
          mba_number: li?.mba_number,
          version_number: li?.version_number,
          line_item_id: li?.lineItemId || `${key}-${monthIdx}-${mtIdx}-${liIdx}`
        })
      })
    })
  })

  return result
}

// Normalize MBA and string fields for consistent matching
const normalize = (value: any) => String(value ?? "").trim().toLowerCase()

// Compare master ids safely (handles string/number)
function matchesMasterId(itemMasterId: any, masterId: any): boolean {
  const itemIdNum = Number(itemMasterId)
  const masterIdNum = Number(masterId)
  if (Number.isFinite(itemIdNum) && Number.isFinite(masterIdNum)) {
    return itemIdNum === masterIdNum
  }
  return String(itemMasterId) === String(masterId)
}

function parseJsonMaybe<T>(value: any): T | null {
  if (!value) return null
  if (typeof value === "object") return value as T
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T
    } catch {
      return null
    }
  }
  return null
}

function normalizeDeliverySchedule(raw: any) {
  const parsed = parseJsonMaybe<any[]>(raw) || []
  const spendByChannel: Record<string, number> = {}
  const monthlyMap: Record<string, Record<string, number>> = {}

  parsed.forEach((entry) => {
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
      if (isNaN(aDate) || isNaN(bDate)) return a.month.localeCompare(b.month)
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

function parseSocialBursts(raw: any): Array<{
  start_date: string
  end_date: string
  media_investment: number
  deliverables: number
}> {
  const bursts = parseJsonMaybe<any[]>(raw) || []
  return bursts
    .map((b) => ({
      start_date: b?.start_date || b?.startDate || "",
      end_date: b?.end_date || b?.endDate || "",
      media_investment: parseAmount(b?.media_investment ?? b?.budget ?? b?.amount ?? b?.spend),
      deliverables: parseAmount(b?.deliverables ?? b?.deliverable ?? b?.deliverablesAmount),
    }))
    .filter((b) => b.start_date && b.end_date)
}

function normalizeSocialLineItems(rawItems: any[]): any[] {
  return (Array.isArray(rawItems) ? rawItems : []).map((item) => {
    const bursts = parseSocialBursts(item?.bursts_json ?? item?.bursts)
    const totalBudget =
      parseAmount(item?.totalMedia) ||
      parseAmount(item?.grossMedia) ||
      parseAmount(item?.budget) ||
      parseAmount(item?.total_budget) ||
      bursts.reduce((sum, b) => sum + (b.media_investment || 0), 0)

    const deliverableTotal =
      parseAmount(item?.goal_deliverable_total) ||
      parseAmount(item?.deliverables_total) ||
      bursts.reduce((sum, b) => sum + (b.deliverables || 0), 0)

    return {
      ...item,
      bursts,
      total_budget: totalBudget,
      goal_deliverable_total: deliverableTotal,
    }
  })
}


export async function GET(
  request: Request,
  { params }: { params: Promise<{ mba_number: string }> }
) {
  try {
    const { mba_number } = await params
    const requestedNormalized = normalize(mba_number)
    const searchParams = new URL(request.url).searchParams
    const requestedVersion = parseVersionNumber(searchParams.get("version"))
    
    // Fetch media plan version data (similar to existing MBA route)
    const masterQueryUrl = `${xanoUrl("media_plan_master", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?mba_number=${encodeURIComponent(mba_number)}`
    const masterResponse = await axios.get(masterQueryUrl)
    
    let masterData: any = null
    if (Array.isArray(masterResponse.data)) {
      masterData = masterResponse.data.find((item: any) => normalize(item?.mba_number) === requestedNormalized)
      if (!masterData && masterResponse.data.length > 0) {
        masterData = masterResponse.data[0]
      }
    } else {
      masterData = normalize((masterResponse.data as any)?.mba_number) === requestedNormalized
        ? masterResponse.data
        : null
    }
    
    if (!masterData) {
      return NextResponse.json(
        { error: `Media plan master not found for MBA number: ${mba_number}` },
        { status: 404 }
      )
    }
    
    // Collect versions for this MBA. Xano filters can be inconsistent across environments,
    // so we attempt a targeted fetch first and then fall back to a full table scan.
    const collectedVersions: any[] = []

    // Targeted fetch by MBA number
    try {
      const versionQueryUrl = `${xanoUrl("media_plan_versions", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?mba_number=${encodeURIComponent(mba_number)}`
      const versionResponse = await axios.get(versionQueryUrl)
      const data = Array.isArray(versionResponse.data)
        ? versionResponse.data
        : versionResponse.data
          ? [versionResponse.data]
          : []
      collectedVersions.push(...data)
    } catch (err) {
      console.warn("Targeted version fetch by mba_number failed", {
        mba_number,
        error: err instanceof Error ? err.message : String(err)
      })
    }

    // Fallback: fetch all versions when mba_number filter returns nothing (prevents 404s when filters change)
    if (collectedVersions.length === 0) {
      try {
        const allVersionsResponse = await axios.get(
          xanoUrl("media_plan_versions", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])
        )
        const allData = Array.isArray(allVersionsResponse.data)
          ? allVersionsResponse.data
          : allVersionsResponse.data
            ? [allVersionsResponse.data]
            : []
        collectedVersions.push(...allData)
      } catch (err) {
        console.warn("Fallback fetch of all media_plan_versions failed", {
          mba_number,
          error: err instanceof Error ? err.message : String(err)
        })
      }
    }

    // Additional fallback by master_id to support legacy records that may not include mba_number
    if (collectedVersions.length === 0 && masterData?.id !== undefined) {
      try {
        const fallbackUrl = `${xanoUrl("media_plan_versions", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?media_plan_master_id=${encodeURIComponent(masterData.id)}`
        const fallbackResponse = await axios.get(fallbackUrl)
        const fallbackData = Array.isArray(fallbackResponse.data)
          ? fallbackResponse.data
          : fallbackResponse.data
            ? [fallbackResponse.data]
            : []
        collectedVersions.push(...fallbackData)
      } catch (fallbackErr) {
        console.warn("Fallback fetch by master_id failed", {
          masterId: masterData?.id,
          error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
        })
      }
    }
    
    let versionData: any = null
    if (collectedVersions.length > 0) {
      // Only consider records that match the requested MBA; prefer ones that also match the master id
      const versionsForMBA = collectedVersions.filter((item: any) => 
        normalize(item?.mba_number) === requestedNormalized
      )

      const preferredVersions = masterData?.id !== undefined
        ? versionsForMBA.filter((item: any) => matchesMasterId(item.media_plan_master_id, masterData.id))
        : versionsForMBA

      const candidates = preferredVersions.length > 0 ? preferredVersions : versionsForMBA

      // If a version is explicitly requested, pick it if available
      if (requestedVersion !== null) {
        versionData = candidates.find((item: any) => parseVersionNumber(item?.version_number) === requestedVersion) ?? null
      }

      // Otherwise choose the latest version number, falling back to any MBA match if master match is absent
      if (!versionData) {
        versionData = candidates.reduce((latest: any, item: any) => {
          const itemVersion = parseVersionNumber(item?.version_number) ?? -Infinity
          if (!latest) return item
          const latestVersionValue = parseVersionNumber(latest?.version_number) ?? -Infinity
          return itemVersion > latestVersionValue ? item : latest
        }, null as any)
      }
    }
    
    if (!versionData) {
      return NextResponse.json(
        { error: "Media plan version not found" },
        { status: 404 }
      )
    }

    // Use the resolved version number (fall back to master's version or 1)
    const versionNumber = requestedVersion 
      ?? parseVersionNumber(versionData?.version_number) 
      ?? parseVersionNumber(masterData.version_number) 
      ?? 1

    // Derive media types to fetch based on flags in version data
    const mediaFlagMap: Record<string, { canonicalKey: typeof CANONICAL_MEDIA_KEYS[number]; fetchKey: keyof typeof MEDIA_CONTAINER_ENDPOINTS }> = {
      mp_television: { canonicalKey: "television", fetchKey: "television" },
      mp_radio: { canonicalKey: "radio", fetchKey: "radio" },
      mp_newspaper: { canonicalKey: "newspaper", fetchKey: "newspaper" },
      mp_magazines: { canonicalKey: "magazines", fetchKey: "magazines" },
      mp_ooh: { canonicalKey: "ooh", fetchKey: "ooh" },
      mp_cinema: { canonicalKey: "cinema", fetchKey: "cinema" },
      mp_digidisplay: { canonicalKey: "digitalDisplay", fetchKey: "digitalDisplay" },
      mp_digiaudio: { canonicalKey: "digitalAudio", fetchKey: "digitalAudio" },
      mp_digivideo: { canonicalKey: "digitalVideo", fetchKey: "digitalVideo" },
      mp_bvod: { canonicalKey: "bvod", fetchKey: "bvod" },
      mp_integration: { canonicalKey: "integration", fetchKey: "integration" },
      mp_search: { canonicalKey: "search", fetchKey: "search" },
      mp_socialmedia: { canonicalKey: "socialMedia", fetchKey: "socialMedia" },
      mp_progdisplay: { canonicalKey: "progDisplay", fetchKey: "progDisplay" },
      mp_progvideo: { canonicalKey: "progVideo", fetchKey: "progVideo" },
      mp_progbvod: { canonicalKey: "progBvod", fetchKey: "progBvod" },
      mp_progaudio: { canonicalKey: "progAudio", fetchKey: "progAudio" },
      mp_progooh: { canonicalKey: "progOoh", fetchKey: "progOoh" },
      mp_influencers: { canonicalKey: "influencers", fetchKey: "influencers" },
      mp_production: { canonicalKey: "production", fetchKey: "production" },
    }

    function isTruthyFlag(value: any) {
      if (value === undefined || value === null) return false
      if (typeof value === "boolean") return value
      if (typeof value === "number") return value !== 0
      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase()
        return ["yes", "true", "1", "y"].includes(normalized)
      }
      return false
    }

    const enabledEntries = Object.entries(mediaFlagMap)
      .filter(([flag]) => isTruthyFlag((versionData as any)?.[flag]))
      .map(([, value]) => value)

    // mp_production also gates consulting (shares production container)
    const enabledEntriesWithConsulting = isTruthyFlag((versionData as any)?.mp_production)
      ? [...enabledEntries, { canonicalKey: "consulting" as const, fetchKey: "production" as const }]
      : enabledEntries

    const enabledMediaTypes = Array.from(new Set(enabledEntriesWithConsulting.map((entry) => entry.canonicalKey)))
    const mediaTypesToFetch = Array.from(new Set(enabledEntriesWithConsulting.map((entry) => entry.fetchKey)))

    if (isDev) {
      console.info("[campaigns] enabled media types", { mba_number, versionNumber, enabledMediaTypes })
    }
    
    // Fetch line items only for enabled media types (fallback to all if none flagged)
    const rawLineItems = await fetchAllMediaContainerLineItems(
      mba_number,
      versionNumber,
      mediaTypesToFetch.length ? mediaTypesToFetch : undefined
    )
    if (isDev) {
      const endpointsCalled = (mediaTypesToFetch.length ? mediaTypesToFetch : Object.keys(MEDIA_CONTAINER_ENDPOINTS)).map(
        (key) =>
          `${xanoUrl(MEDIA_CONTAINER_ENDPOINTS[key as keyof typeof MEDIA_CONTAINER_ENDPOINTS], ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}`
      )
      console.info("[campaigns] Xano endpoints called", { mba_number, versionNumber, endpointsCalled })
    }

    // Filter line items to ensure MBA + version alignment (mirrors editor behavior)
    let lineItems = Object.fromEntries(
      Object.entries(rawLineItems).map(([mediaType, items]) => [
        mediaType,
        Array.isArray(items)
          ? filterLineItemsByPlanNumber(items, mba_number, versionNumber.toString(), mediaType)
          : [],
      ])
    )
    
    // Extract billing schedule (support multiple casing variants)
    const billingScheduleSource = versionData.billingSchedule
      || versionData.billing_schedule
      || masterData.billingSchedule
      || masterData.billing_schedule
      || null

    let billingSchedule: any = null
    if (billingScheduleSource) {
      try {
        billingSchedule = typeof billingScheduleSource === "string"
          ? JSON.parse(billingScheduleSource)
          : billingScheduleSource
      } catch (e) {
        console.warn("Failed to parse billing schedule:", e)
        billingSchedule = billingScheduleSource
      }
    }
    
    // Calculate metrics
    const startDate = versionData.campaign_start_date || versionData.mp_campaigndates_start
    const endDate = versionData.campaign_end_date || versionData.mp_campaigndates_end
    
    const timeElapsed = startDate && endDate 
      ? calculateTimeElapsed(startDate, endDate)
      : 0
    
    const expectedSpendToDate = billingSchedule && startDate && endDate
      ? calculateExpectedSpendToDate(billingSchedule, startDate, endDate)
      : 0

    const billingSpend = billingSchedule && Array.isArray(billingSchedule)
      ? summarizeBillingSchedule(billingSchedule)
      : { spendByMediaChannel: [], monthlySpend: [] }

    const deliverySchedule = normalizeDeliverySchedule(versionData.deliverySchedule || versionData.delivery_schedule)
    
    // If no line items returned, synthesize minimal read-only rows from billingSchedule for display
    const hasAnyLineItems = Object.values(lineItems).some(items => Array.isArray(items) && items.length > 0)
    if (!hasAnyLineItems && billingSchedule && Array.isArray(billingSchedule)) {
      lineItems = synthesizeLineItemsFromBilling(billingSchedule)
    }

    // Normalise line items for gantt consumption (bursts_json strings, derived dates)
    const normalisedContainers = normalizeCampaignLineItems(lineItems, startDate, endDate)

    const lineItemsWithDefaults: Record<string, any[]> = {}
    const consultingEnabled = enabledMediaTypes.includes("consulting")
    CANONICAL_MEDIA_KEYS.forEach((canonicalKey) => {
      const sourceKey = CANONICAL_TO_FETCH_MAP[canonicalKey]
      const items = normalisedContainers[sourceKey] || []
      const scopedItems = canonicalKey === "consulting" && !consultingEnabled ? [] : items
      lineItemsWithDefaults[canonicalKey] = canonicalKey === "socialMedia" ? normalizeSocialLineItems(scopedItems) : scopedItems
    })

    if (isDev) {
      const counts = Object.fromEntries(
        CANONICAL_MEDIA_KEYS.map((key) => [key, Array.isArray(lineItemsWithDefaults[key]) ? lineItemsWithDefaults[key].length : 0])
      )
      console.info("[campaigns] line item counts", { mba_number, versionNumber, counts })
      const enabledEmpty = enabledMediaTypes.filter((key) => (counts as any)[key] === 0)
      if (enabledEmpty.length) {
        console.warn("[campaigns] enabled media types returned zero items", { mba_number, versionNumber, enabledEmpty })
      }
    }

    // Prepare response
    const response = {
      campaign: {
        ...versionData,
        mbaNumber: mba_number,
        versionNumber
      },
      lineItems: lineItemsWithDefaults,
      enabledMediaTypes,
      billingSchedule,
      deliverySchedule: deliverySchedule.raw,
      metrics: {
        timeElapsed,
        ...(startDate && endDate ? calculateDayMetrics(startDate, endDate) : {}),
        expectedSpendToDate,
        spendByMediaChannel: billingSpend.spendByMediaChannel,
        monthlySpend: billingSpend.monthlySpend,
        deliverySpendByChannel: deliverySchedule.spendByMediaChannel,
        deliveryMonthlySpend: deliverySchedule.monthlySpend
      }
    }
    
    return NextResponse.json(response)
  } catch (error) {
    console.error("Error fetching campaign data:", error)
    
    if (axios.isAxiosError(error)) {
      return NextResponse.json(
        { 
          error: `Failed to fetch campaign data: ${error.message}`,
          details: {
            status: error.response?.status,
            statusText: error.response?.statusText,
            url: error.config?.url
          }
        },
        { status: error.response?.status || 500 }
      )
    }
    
    return NextResponse.json(
      { 
        error: "Failed to fetch campaign data",
        message: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
