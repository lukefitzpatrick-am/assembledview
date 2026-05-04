import CampaignPageAssembly from "./components/CampaignPageAssembly"
import { fetchVersionsForMba } from "@/lib/api/dashboard"
import { auth0 } from "@/lib/auth0"
import { getPrimaryRole, getUserClientIdentifier, getUserMbaNumbers } from "@/lib/rbac"
import { redirect, notFound } from "next/navigation"
import { headers } from "next/headers"
import { createPerfTimer, logPerf } from "@/lib/utils/perf"
import { normalizeDateToMelbourneISO } from "@/lib/dates/normalizeCampaignDateISO"
import { resolveMonthlySpendForPlan } from "@/lib/spend/monthlyPlanCalendar"
import {
  resolveCampaignExpectedSpendToDate,
  resolveCampaignTotalPlannedSpend,
} from "@/lib/spend/resolveCampaignExpectedSpend"

interface CampaignDetailPageProps {
  params: Promise<{
    slug: string
    mba_number: string
  }>
  searchParams?: Promise<{
    version?: string
    startDate?: string
    endDate?: string
  }>
}

const DEBUG_LINE_ITEMS = process.env.NEXT_PUBLIC_DEBUG_LINEITEMS === "true"
const DEBUG_BRAND = process.env.NEXT_PUBLIC_DEBUG_BRAND === "true"
const DEBUG_SPEND = process.env.NEXT_PUBLIC_DEBUG_SPEND === "true"
const DEBUG_PACING = process.env.NEXT_PUBLIC_DEBUG_PACING === "true"

function isTruthyFlag(value: unknown): boolean {
  if (value === true) return true
  if (value === 1) return true
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    return ["true", "1", "yes", "y", "on"].includes(normalized)
  }
  if (typeof value === "number") {
    return Number.isFinite(value) && value !== 0
  }
  return false
}

function parseAmountSafe(value: any) {
  if (typeof value === "number") return value
  if (typeof value === "string") {
    const parsed = parseFloat(value.replace(/[^0-9.-]+/g, ""))
    return Number.isNaN(parsed) ? 0 : parsed
  }
  return 0
}

function deriveSpendToDate(deliverySchedule: any[]) {
  if (!Array.isArray(deliverySchedule)) return 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return deliverySchedule.reduce((sum, entry) => {
    const dateValue = entry?.date || entry?.DATE || entry?.startDate || entry?.start_date
    const entryDate = dateValue ? new Date(dateValue) : null
    if (entryDate && !Number.isNaN(entryDate.getTime())) {
      entryDate.setHours(0, 0, 0, 0)
      if (entryDate <= today) {
        return sum + parseAmountSafe(entry?.spend ?? entry?.amount ?? entry?.budget ?? entry?.value ?? entry?.media_investment)
      }
    }
    return sum
  }, 0)
}

function toISODateOnlySafe(value: unknown): string | null {
  return normalizeDateToMelbourneISO(value)
}

function clampISODateOnly(value: string | null | undefined, min: string | null, max: string | null): string | null {
  if (!value) return null
  const iso = toISODateOnlySafe(value)
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
    // If user swapped them, normalize to a valid window by swapping.
    return { startISO: endClamped, endISO: startClamped }
  }

  return { startISO: startClamped, endISO: endClamped }
}

function normaliseHexColour(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined
  const trimmed = input.trim()
  if (!trimmed) return undefined
  const raw = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed
  const hex = raw.toLowerCase()

  if (/^[0-9a-f]{3}$/.test(hex)) {
    const expanded = hex
      .split("")
      .map((char) => `${char}${char}`)
      .join("")
    return `#${expanded.toUpperCase()}`
  }

  if (/^[0-9a-f]{6}$/.test(hex)) {
    return `#${hex.toUpperCase()}`
  }

  if (/^[0-9a-f]{8}$/.test(hex)) {
    return `#${hex.slice(0, 6).toUpperCase()}`
  }

  return undefined
}

function hexToRgba(hex: string | undefined, alpha: number) {
  if (!hex) return null
  const normalised = normaliseHexColour(hex)
  if (!normalised) return null
  const stripped = normalised.slice(1)
  const r = Number.parseInt(stripped.slice(0, 2), 16)
  const g = Number.parseInt(stripped.slice(2, 4), 16)
  const b = Number.parseInt(stripped.slice(4, 6), 16)
  if ([r, g, b].some((value) => Number.isNaN(value))) return null
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function getBrandGradientStyle(brandColour?: string) {
  const start = brandColour ? hexToRgba(brandColour, 0.55) : null
  const mid = brandColour ? hexToRgba(brandColour, 0.22) : null
  const end = brandColour ? hexToRgba(brandColour, 0) : null
  if (!start || !mid || !end) return undefined
  return { backgroundImage: `linear-gradient(90deg, ${start} 0%, ${mid} 45%, ${end} 100%)` }
}

/**
 * Resolves running media types from campaign data.
 * Supports multiple possible shapes and falls back to inferring from line items.
 */
function resolveRunningMediaTypes(
  campaignData: any,
  campaign: any,
  lineItemsMap: Record<string, any[]>
): string[] {
  // Try to get running media types from campaign data
  const runningMediaTypes =
    campaignData?.runningMediaTypes ??
    campaign?.runningMediaTypes ??
    campaign?.running_media_types ??
    campaign?.running_media_channels ??
    campaign?.mediaTypesRunning ??
    campaign?.media_types_running

  if (Array.isArray(runningMediaTypes) && runningMediaTypes.length > 0) {
    return runningMediaTypes.map((type: any) => String(type).toLowerCase())
  }

  // Fall back to inferring from line items
  const inferredTypes: string[] = []
  const allLineItems = Object.values(lineItemsMap).flat()

  for (const item of allLineItems) {
    if (!item || typeof item !== "object") continue

    const isRunning =
      item.is_running === true ||
      item.running === true ||
      (typeof item.status === "string" &&
        (item.status.toLowerCase() === "running" || item.status.toLowerCase() === "active")) ||
      (typeof item.line_item_status === "string" &&
        (item.line_item_status.toLowerCase() === "running" ||
          item.line_item_status.toLowerCase() === "active"))

    if (isRunning) {
      // Try to determine media type from item properties
      const mediaType =
        item.media_type ??
        item.mediaType ??
        item.media_channel ??
        item.mediaChannel ??
        item.channel

      if (mediaType) {
        const normalizedType = String(mediaType).toLowerCase().replace(/\s+/g, "")
        if (!inferredTypes.includes(normalizedType)) {
          inferredTypes.push(normalizedType)
        }
      }
    }
  }

  return inferredTypes
}

/**
 * Checks if a line item is running based on various flag patterns.
 */
function isLineItemRunning(item: any): boolean {
  if (!item || typeof item !== "object") return false

  return (
    item.is_running === true ||
    item.running === true ||
    (typeof item.status === "string" &&
      (item.status.toLowerCase() === "running" || item.status.toLowerCase() === "active")) ||
    (typeof item.line_item_status === "string" &&
      (item.line_item_status.toLowerCase() === "running" ||
        item.line_item_status.toLowerCase() === "active"))
  )
}

/**
 * Normalizes a media type string to match expected keys.
 */
function normalizeMediaType(type: string): string {
  return String(type)
    .toLowerCase()
    .replace(/[\s_-]+/g, "")
    .replace(/^social(media)?$/, "socialmedia")
    .replace(/^programmaticdisplay$|^progdisplay$/, "progdisplay")
    .replace(/^programmaticvideo$|^progvideo$/, "progvideo")
}

/**
 * Gets line items from a map by trying multiple key candidates.
 * Returns the first array found, or an empty array if none found.
 */
function getLineItems(map: Record<string, any>, keys: string[]): any[] {
  if (!map || typeof map !== "object") return []
  for (const key of keys) {
    const value = map[key]
    if (Array.isArray(value)) {
      return value
    }
  }
  return []
}

/**
 * Collects line items from all given keys in the map, merges and dedupes.
 * Use this when we need every item (e.g. all search line item IDs for Snowflake)
 * and the API may use different keys.
 */
function getAllLineItemsFromKeys(map: Record<string, any>, keys: string[]): any[] {
  if (!map || typeof map !== "object") return []
  const seen = new Set<string>()
  const result: any[] = []
  const extractId = (item: any) =>
    item?.line_item_id ?? item?.lineItemId ?? item?.LINE_ITEM_ID
  for (const key of keys) {
    const value = map[key]
    if (!Array.isArray(value)) continue
    for (const item of value) {
      const id = extractId(item)
      const keyStr = id ? String(id).trim().toLowerCase() : null
      if (keyStr && !seen.has(keyStr)) {
        seen.add(keyStr)
        result.push(item)
      } else if (!keyStr) {
        result.push(item)
      }
    }
  }
  return result
}

async function fetchCampaignData(mbaNumber: string, opts?: { version?: string; startDate?: string; endDate?: string }) {
  const headerList = await headers()
  const host =
    headerList.get("x-forwarded-host") ||
    headerList.get("host") ||
    process.env.NEXT_PUBLIC_VERCEL_URL

  // Default to http for local dev to avoid https://localhost failures
  const defaultProtocol = host?.includes("localhost") || host?.includes("127.0.0.1") ? "http" : "https"
  const protocol = headerList.get("x-forwarded-proto") || defaultProtocol

  const envBase = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "")
  const runtimeBase = host ? `${protocol}://${host}` : ""
  const baseUrl = envBase || runtimeBase
  const queryParts: string[] = []
  if (opts?.version) {
    queryParts.push(`version=${encodeURIComponent(opts.version)}`)
  }
  if (opts?.startDate) {
    queryParts.push(`startDate=${encodeURIComponent(opts.startDate)}`)
  }
  if (opts?.endDate) {
    queryParts.push(`endDate=${encodeURIComponent(opts.endDate)}`)
  }
  const queryString = queryParts.length ? `?${queryParts.join("&")}` : ""
  const urlPath = `/api/mediaplans/mba/${encodeURIComponent(mbaNumber)}${queryString}`
  const url = baseUrl ? `${baseUrl}${urlPath}` : urlPath

  let response: Response
  try {
    const cookieHeader = headerList.get("cookie") ?? ""
    response = await fetch(url, {
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        cookie: cookieHeader,
      },
    })
  } catch (err) {
    console.error("fetchCampaignData request failed", {
      url,
      host,
      protocol,
      envBase,
      runtimeBase,
      error: err instanceof Error ? err.message : String(err),
    })
    throw new Error("Could not reach campaign API")
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "")
    console.error("fetchCampaignData failed", {
      url,
      status: response.status,
      statusText: response.statusText,
      bodyText,
    })
    let errorDetail: any = {}
    try {
      errorDetail = bodyText ? JSON.parse(bodyText) : {}
    } catch {
      errorDetail = {}
    }
    throw new Error(errorDetail.error || `Failed to fetch campaign data: ${response.statusText}`)
  }

  return response.json()
}

export default async function CampaignDetailPage({ params, searchParams }: CampaignDetailPageProps) {
  // ============================================================================
  // PERFORMANCE: Start page timer
  // ============================================================================
  const pageTimer = createPerfTimer(`CampaignPage[${(await params).mba_number}]`)

  const { slug, mba_number } = await params
  const { version } = searchParams ? await searchParams : {}
  const parsedVersion = version ? Number(version) : undefined
  const versionNumberFromQuery = Number.isFinite(parsedVersion) ? parsedVersion : undefined

  // Auth check with timing
  const authStart = performance.now()
  const session = await auth0.getSession()
  const user = session?.user
  const role = getPrimaryRole(user)
  const userClientSlug = getUserClientIdentifier(user)
  logPerf("Auth check", authStart, { hasUser: !!user, role })

  if (!user) {
    redirect(`/auth/login?returnTo=/dashboard/${slug}/${mba_number}`)
  }

  // Log for debugging
  console.log("[dashboard/[slug]/[mba_number]] Tenant safety check", {
    email: user.email,
    role,
    requestedSlug: slug,
    requestedMba: mba_number,
    userClientSlug,
    app_metadata: user['app_metadata'],
  })

  // Enforce tenant safety: client users can only access their own slug
  if (role === "client") {
    if (!userClientSlug) {
      console.error("[dashboard/[slug]/[mba_number]] Client user missing client_slug in app_metadata", {
        email: user.email,
        requestedSlug: slug,
        requestedMba: mba_number,
        app_metadata: user['app_metadata'],
      })
      notFound()
    }

    // Case-insensitive comparison for slug
    if (userClientSlug.toLowerCase() !== slug.toLowerCase()) {
      console.warn("[dashboard/[slug]/[mba_number]] Tenant mismatch - client attempted to access another client's campaign", {
        email: user.email,
        userClientSlug,
        requestedSlug: slug,
        requestedMba: mba_number,
      })
      notFound()
    }

    // Check if mba_number is in the user's assigned MBA numbers
    const userMbaNumbers = getUserMbaNumbers(user)
    if (userMbaNumbers.length > 0) {
      // Case-insensitive comparison for MBA numbers
      const mbaMatches = userMbaNumbers.some(
        (mba) => mba.toLowerCase() === mba_number.toLowerCase()
      )
      if (!mbaMatches) {
        console.warn("[dashboard/[slug]/[mba_number]] MBA number not assigned to user", {
          email: user.email,
          userClientSlug,
          requestedMba: mba_number,
          assignedMbaNumbers: userMbaNumbers,
        })
        notFound()
      }
    }
  }

  let campaignData: any = null
  let error: string | null = null
  let campaign: any = null
  let campaignVersion: Record<string, any> = {}
  let resolvedVersionNumber: number | undefined

  // Campaign data fetch with timing
  const campaignFetchStart = performance.now()
  try {
    campaignData = await fetchCampaignData(mba_number, {
      version,
    })
    campaign = campaignData?.campaign ?? campaignData
    campaignVersion = campaignData?.versionData ?? campaignData?.mediaPlanVersion ?? campaignData?.campaign ?? campaignData ?? {}
    resolvedVersionNumber = Number(
      versionNumberFromQuery ??
        campaignData?.versionNumber ??
        campaignData?.version_number ??
        campaignVersion?.mp_plannumber ??
        campaignVersion?.mp_plan_number ??
        campaignVersion?.version_number ??
        campaignVersion?.versionNumber ??
        campaign?.mp_plannumber ??
        campaign?.mp_plan_number ??
        campaign?.version_number
    )
    if (!Number.isFinite(resolvedVersionNumber)) {
      throw new Error(`No media plan version number available for MBA ${mba_number}`)
    }
    logPerf("Campaign data fetch", campaignFetchStart, {
      mba: mba_number,
      version: resolvedVersionNumber,
      hasLineItems: !!campaignData?.lineItems,
    })
  } catch (err) {
    logPerf("Campaign data fetch (failed)", campaignFetchStart, {
      mba: mba_number,
      error: err instanceof Error ? err.message : String(err),
    })
    error = err instanceof Error ? err.message : "Unknown error occurred"
    console.error("Campaign detail page error:", err)
  }

  if (error || !campaignData) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="max-w-2xl text-center">
          <h2 className="mb-4 text-2xl font-bold text-red-900">Campaign Not Found</h2>
          <p className="mb-4 text-red-600">{error || "The requested campaign could not be found."}</p>
          <p className="text-sm text-gray-600">Please check the MBA number and try again.</p>
        </div>
      </div>
    )
  }

  const versionNumber = resolvedVersionNumber ?? versionNumberFromQuery
  const availableVersions = await fetchVersionsForMba(mba_number).catch((err) => {
    console.warn("[dashboard] failed to load version list:", err)
    return []
  })
  const lineItemsMap = (campaignData?.lineItems ?? {}) as Record<string, any[]>
  if (DEBUG_LINE_ITEMS) {
    console.log("[DATA LOAD] campaign data version info", {
      mba_number: campaignVersion?.mba_number ?? campaign?.mba_number ?? mba_number,
      version_number: versionNumber ?? null,
    })
  }
  const metrics = campaignData.metrics || {}
  const billingSchedule = campaignData.billingSchedule
  const deliverySchedule = campaignData.deliverySchedule || []

  const resolveXanoOrigin = (raw: string | undefined): string => {
    if (!raw || typeof raw !== "string") return ""
    try {
      const url = new URL(raw)
      return url.origin
    } catch {
      return ""
    }
  }

  const xanoFileOrigin =
    resolveXanoOrigin(process.env.XANO_SAVE_FILE_BASE_URL) ||
    resolveXanoOrigin(process.env.XANO_MEDIA_PLANS_BASE_URL) ||
    resolveXanoOrigin(process.env.XANO_MEDIAPLANS_BASE_URL)

  // Public File metadata fields are stored on media_plan_versions
  const mediaPlanFileMeta =
    campaignVersion?.media_plan ??
    campaign?.media_plan ??
    campaignData?.media_plan ??
    null
  const mbaPdfFileMeta =
    campaignVersion?.mba_pdf ??
    campaign?.mba_pdf ??
    campaignData?.mba_pdf ??
    null
  
  const mpSearchEnabled = isTruthyFlag(
    campaign?.mp_search ??
      campaignVersion?.mp_search ??
      campaignData?.mp_search ??
      campaignData?.versionData?.mp_search
  )

  // Resolve running media types
  const runningMediaTypes = resolveRunningMediaTypes(campaignData, campaign, lineItemsMap)
  
  // Get all line items using resilient getter
  const socialKeys = ["socialMedia", "social", "paidSocial", "social_media", "social_media_line_items"]
  const searchKeys = ["search", "paidSearch", "paid_search", "search_line_items", "searchLineItems"]
  const progDisplayKeys = ["progDisplay", "programmaticDisplay", "dv360Display", "programmatic_display"]
  const progVideoKeys = ["progVideo", "programmaticVideo", "dv360Video", "programmatic_video"]
  
  const socialItems = getLineItems(lineItemsMap, socialKeys)
  const searchItems = getLineItems(lineItemsMap, searchKeys)
  const searchItemsAllKeys = getAllLineItemsFromKeys(lineItemsMap, searchKeys)
  const progDisplayItems = getLineItems(lineItemsMap, progDisplayKeys)
  const progVideoItems = getLineItems(lineItemsMap, progVideoKeys)
  
  // Track which keys were actually used (for debug logging)
  let socialKeyUsed: string | null = null
  let searchKeyUsed: string | null = null
  let progDisplayKeyUsed: string | null = null
  let progVideoKeyUsed: string | null = null
  
  for (const key of socialKeys) {
    if (Array.isArray(lineItemsMap[key])) {
      socialKeyUsed = key
      break
    }
  }
  for (const key of searchKeys) {
    if (Array.isArray(lineItemsMap[key])) {
      searchKeyUsed = key
      break
    }
  }
  for (const key of progDisplayKeys) {
    if (Array.isArray(lineItemsMap[key])) {
      progDisplayKeyUsed = key
      break
    }
  }
  for (const key of progVideoKeys) {
    if (Array.isArray(lineItemsMap[key])) {
      progVideoKeyUsed = key
      break
    }
  }
  
  // Determine if media types are running
  const normalizedRunningTypes = runningMediaTypes.map(normalizeMediaType)
  const isSocialRunning =
    normalizedRunningTypes.includes("socialmedia") ||
    normalizedRunningTypes.includes("social") ||
    (runningMediaTypes.length === 0 && socialItems.some(isLineItemRunning))
  const isProgrammaticDisplayRunning =
    normalizedRunningTypes.includes("progdisplay") ||
    normalizedRunningTypes.includes("programmaticdisplay") ||
    (runningMediaTypes.length === 0 && progDisplayItems.some(isLineItemRunning))
  const isProgrammaticVideoRunning =
    normalizedRunningTypes.includes("progvideo") ||
    normalizedRunningTypes.includes("programmaticvideo") ||
    (runningMediaTypes.length === 0 && progVideoItems.some(isLineItemRunning))
  
  // Filter line items to running-only (kept for debugging)
  const socialItemsRunning = socialItems.filter(isLineItemRunning)
  const progDisplayItemsRunning = progDisplayItems.filter(isLineItemRunning)
  const progVideoItemsRunning = progVideoItems.filter(isLineItemRunning)
  
  // Create "active" arrays based on existence of items (not running flags)
  const socialItemsActive = socialItems
  const searchItemsActive = searchItemsAllKeys.length > 0 ? searchItemsAllKeys : searchItems
  const progDisplayItemsActive = progDisplayItems
  const progVideoItemsActive = progVideoItems
  
  // Build deliveryLineItemIds from active arrays (not running-only arrays)
  // Accept multiple id field variations
  const extractLineItemId = (item: any): string | null => {
    if (!item || typeof item !== "object") return null
    const id = item.line_item_id ?? item.lineItemId ?? item.LINE_ITEM_ID
    return id ? String(id) : null
  }
  
  const searchLineItemIds = Array.from(
    new Set(
      (searchItemsAllKeys ?? searchItemsActive ?? [])
        .map(extractLineItemId)
        .filter((id): id is string => Boolean(id))
    )
  )

  const deliveryLineItemIds = Array.from(
    new Set(
      [...socialItemsActive, ...progDisplayItemsActive, ...progVideoItemsActive]
        .map(extractLineItemId)
        .filter((id): id is string => Boolean(id))
    )
  )
  
  // DEBUG logging
  if (DEBUG_PACING) {
    const sampleIds = deliveryLineItemIds.slice(0, 5)
    console.log("[PACING DEBUG] Media types and line items", {
      keysUsed: {
        social: socialKeyUsed,
        search: searchKeyUsed,
        progDisplay: progDisplayKeyUsed,
        progVideo: progVideoKeyUsed,
      },
      resolvedRunningMediaTypes: runningMediaTypes,
      normalizedRunningTypes,
      isSocialRunning,
      isProgrammaticDisplayRunning,
      isProgrammaticVideoRunning,
      lineItemCounts: {
        social: { total: socialItems.length, running: socialItemsRunning.length, active: socialItemsActive.length },
        search: { total: searchItems.length, allKeys: searchItemsAllKeys.length, active: searchItemsActive.length },
        progDisplay: { total: progDisplayItems.length, running: progDisplayItemsRunning.length, active: progDisplayItemsActive.length },
        progVideo: { total: progVideoItems.length, running: progVideoItemsRunning.length, active: progVideoItemsActive.length },
      },
      deliveryLineItemIdsCount: deliveryLineItemIds.length,
      sampleLineItemIds: sampleIds,
      searchLineItemIdsCount: searchLineItemIds.length,
    })
  }
  const debugLineItemCounts = Object.entries(lineItemsMap).map(
    ([key, value]) => `${key}: ${Array.isArray(value) ? value.length : 0}`
  )

  const spendByChannel =
    (metrics.deliverySpendByChannel && metrics.deliverySpendByChannel.length > 0
      ? metrics.deliverySpendByChannel
      : metrics.spendByMediaChannel) || []

  const monthlySpend = resolveMonthlySpendForPlan(
    metrics.deliveryMonthlySpend,
    metrics.monthlySpend,
    deliverySchedule,
  )

  const budget = parseAmountSafe(
    campaign?.campaign_budget || campaign?.mp_campaignbudget || campaign?.total_budget || campaign?.total_media
  )
  const startDate = campaign?.campaign_start_date || campaign?.mp_campaigndates_start
  const endDate = campaign?.campaign_end_date || campaign?.mp_campaigndates_end

  const campaignStartISO = toISODateOnlySafe(startDate)
  const campaignEndISO = toISODateOnlySafe(endDate)
  // Date range in URL is client-only (charts / timeline); full campaign used for fetch and spend resolution.
  const requestedStartISO: string | null = null
  const requestedEndISO: string | null = null
  const { startISO: effectiveStartISO, endISO: effectiveEndISO } = computeEffectiveDateRange({
    campaignStartISO,
    campaignEndISO,
    requestedStartISO,
    requestedEndISO,
  })

  const deliverySpendToDate = deriveSpendToDate(deliverySchedule)
  const metricsActual = metrics.actualSpendToDate
  const trackedActualSpend =
    typeof metricsActual === "number" && Number.isFinite(metricsActual) && metricsActual > 0
      ? metricsActual
      : deliverySpendToDate || 0

  const monthlyPlanDateOpts = {
    campaignStartISO: effectiveStartISO,
    campaignEndISO: effectiveEndISO,
  }

  const expectedSpend = resolveCampaignExpectedSpendToDate({
    billingSchedule,
    campaignStartISO: effectiveStartISO,
    campaignEndISO: effectiveEndISO,
    monthlySpend,
    monthlyOpts: monthlyPlanDateOpts,
    metricsExpectedSpendToDate: metrics.expectedSpendToDate,
    deliverySchedule,
  })

  const totalPlannedMonthlySpend = resolveCampaignTotalPlannedSpend({
    deliverySchedule,
    monthlySpend,
    monthlyOpts: monthlyPlanDateOpts,
    billingSchedule,
    campaignStartISO: effectiveStartISO,
    campaignEndISO: effectiveEndISO,
    campaignBudget: budget,
  })

  const actualSpend = trackedActualSpend

  if (DEBUG_SPEND) {
    console.log("[Spend Debug] spend resolution", {
      trackedActualSpend,
      deliverySpendToDate,
      metricsActualSpendToDate: metrics.actualSpendToDate,
      expectedSpend,
      totalPlannedMonthlySpend,
      metricsExpectedSpendToDate: metrics.expectedSpendToDate,
    })
  }

  const pacingSectionStartISO =
    effectiveStartISO ?? campaignStartISO ?? toISODateOnlySafe(startDate)
  const pacingSectionEndISO = effectiveEndISO ?? campaignEndISO ?? toISODateOnlySafe(endDate)
  const hasPacingCampaignDates = Boolean(pacingSectionStartISO && pacingSectionEndISO)

  const initialPacingRows: any[] = []

  const shouldUseDeliveryWrapper =
    deliveryLineItemIds.length > 0 ||
    (mpSearchEnabled && searchLineItemIds.length > 0 && hasPacingCampaignDates)

  // Log total SSR time
  pageTimer.total({
    mba: mba_number,
    hasError: !!error,
    pacingRows: initialPacingRows.length,
    lineItemCounts: {
      social: { total: socialItems.length, running: socialItemsRunning.length, active: socialItemsActive.length },
      progDisplay: { total: progDisplayItems.length, running: progDisplayItemsRunning.length, active: progDisplayItemsActive.length },
      progVideo: { total: progVideoItems.length, running: progVideoItemsRunning.length, active: progVideoItemsActive.length },
    },
  })

  const brandCandidates = [
    campaign?.brand_colour,
    campaign?.brandColour,
    campaign?.brand_color,
    campaign?.brandColor,
    campaign?.client_brand_colour,
    campaignData?.client?.brand_colour,
    campaignData?.client?.brandColour,
    campaignData?.client_info?.brand_colour,
    campaignData?.clientInfo?.brand_colour,
    campaignData?.client_details?.brand_colour,
    campaignData?.clientDetails?.brand_colour,
  ]
  const brandColour = normaliseHexColour(brandCandidates.find(Boolean))
  const brandGradientDebug = getBrandGradientStyle(brandColour)
  if (DEBUG_BRAND) {
    console.log("[Brand Debug] brand colour resolution", {
      brandCandidates,
      brandColour,
      hasGradient: Boolean(brandGradientDebug),
    })
  }

  const showDeliverySection =
    shouldUseDeliveryWrapper ||
    socialItemsActive.length > 0 ||
    (mpSearchEnabled && searchLineItemIds.length > 0 && hasPacingCampaignDates) ||
    progDisplayItemsActive.length > 0 ||
    progVideoItemsActive.length > 0

  return (
    <CampaignPageAssembly
      slug={slug}
      mbaNumber={mba_number}
      campaign={campaign}
      metrics={metrics}
      budget={budget}
      actualSpend={actualSpend}
      expectedSpend={expectedSpend}
      totalPlannedMonthlySpend={totalPlannedMonthlySpend}
      startDate={effectiveStartISO ?? startDate}
      endDate={effectiveEndISO ?? endDate}
      campaignStartISO={campaignStartISO}
      campaignEndISO={campaignEndISO}
      brandColour={brandColour}
      deliverySchedule={deliverySchedule}
      spendByChannel={spendByChannel}
      monthlySpend={monthlySpend}
      lineItemsMap={lineItemsMap}
      billingSchedule={billingSchedule}
      xanoFileOrigin={xanoFileOrigin}
      mediaPlanFileMeta={mediaPlanFileMeta}
      mbaPdfFileMeta={mbaPdfFileMeta}
      showDeliverySection={showDeliverySection}
      socialItemsActive={socialItemsActive}
      searchItemsActive={searchItemsActive}
      searchLineItemIds={searchLineItemIds}
      mpSearchEnabled={mpSearchEnabled}
      progDisplayItemsActive={progDisplayItemsActive}
      progVideoItemsActive={progVideoItemsActive}
      deliveryLineItemIds={deliveryLineItemIds}
      availableVersions={availableVersions}
      currentVersion={resolvedVersionNumber ?? versionNumberFromQuery ?? 1}
    />
  )
}
