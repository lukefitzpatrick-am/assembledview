import dynamic from "next/dynamic"
import { Suspense, type ReactNode } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import CampaignActions from "./components/CampaignActions"
import ExpectedSpendToDateCard from "./components/ExpectedSpendToDateCard"
import { auth0 } from "@/lib/auth0"
import { getPrimaryRole, getUserClientIdentifier, getUserMbaNumbers } from "@/lib/rbac"
import { redirect, notFound } from "next/navigation"
import { headers } from "next/headers"
import { createPerfTimer, logPerf } from "@/lib/utils/perf"
import { calculateExpectedSpendToDateFromDeliverySchedule } from "@/lib/spend/expectedSpend"

const CampaignInfoHeader = dynamic(() => import("@/components/dashboard/campaign/CampaignInfoHeader"))
const CampaignSummaryRow = dynamic(() => import("@/components/dashboard/campaign/CampaignSummaryRow"))
const SpendChartsRow = dynamic(() => import("@/components/dashboard/campaign/SpendChartsRow"))
const MediaPlanVizSection = dynamic(() => import("@/components/dashboard/campaign/MediaPlanVizSection"))
const SocialPacingContainer = dynamic(() => import("@/components/dashboard/pacing/social/SocialPacingContainer"))
const ProgrammaticPacingContainer = dynamic(
  () => import("@/components/dashboard/pacing/programmatic/ProgrammaticPacingContainer")
)
const PacingDataProviderWrapper = dynamic(() => import("@/components/dashboard/pacing/PacingDataProviderWrapper"))

interface CampaignDetailPageProps {
  params: Promise<{
    slug: string
    mba_number: string
  }>
  searchParams?: Promise<{
    version?: string
  }>
}

const DEBUG_LINE_ITEMS = process.env.NEXT_PUBLIC_DEBUG_LINEITEMS === "true"
const DEBUG_BRAND = process.env.NEXT_PUBLIC_DEBUG_BRAND === "true"
const DEBUG_SPEND = process.env.NEXT_PUBLIC_DEBUG_SPEND === "true"
const DEBUG_PACING = process.env.NEXT_PUBLIC_DEBUG_PACING === "true"

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

function getCurrentMelbourneYearMonth() {
  const now = new Date()
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now)
  const year = Number(parts.find((part) => part.type === "year")?.value)
  const month = Number(parts.find((part) => part.type === "month")?.value)
  if (Number.isFinite(year) && Number.isFinite(month)) {
    return { year, month }
  }
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

function deriveSpendToDateFromMonthlySpend(monthlySpend: any): number {
  const { year: currentYear, month: currentMonth } = getCurrentMelbourneYearMonth()

  const parseMonthLabel = (input: any): { year: number; month: number } | null => {
    if (!input) return null
    if (input instanceof Date && !Number.isNaN(input.getTime())) {
      return { year: input.getFullYear(), month: input.getMonth() + 1 }
    }
    if (typeof input === "number" && Number.isFinite(input)) {
      const asString = String(input)
      if (asString.length === 6) {
        const year = Number(asString.slice(0, 4))
        const month = Number(asString.slice(4, 6))
        if (month >= 1 && month <= 12) {
          return { year, month }
        }
      }
    }
    if (typeof input === "string") {
      const trimmed = input.trim()
      if (!trimmed) return null

      const isoLike = trimmed.match(/^(\d{4})[-/](\d{1,2})/)
      if (isoLike) {
        const year = Number(isoLike[1])
        const month = Number(isoLike[2])
        if (month >= 1 && month <= 12) {
          return { year, month }
        }
      }

      const monthName = trimmed.match(
        /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i
      )
      if (monthName) {
        const monthIndex =
          [
            "january",
            "february",
            "march",
            "april",
            "may",
            "june",
            "july",
            "august",
            "september",
            "october",
            "november",
            "december",
          ].indexOf(monthName[1].toLowerCase())
        if (monthIndex >= 0) {
          return { year: Number(monthName[2]), month: monthIndex + 1 }
        }
      }

      const parsedDate = new Date(trimmed)
      if (!Number.isNaN(parsedDate.getTime())) {
        return { year: parsedDate.getFullYear(), month: parsedDate.getMonth() + 1 }
      }
    }
    return null
  }

  const sumNumericValues = (value: any): number => {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string") {
      const parsed = parseAmountSafe(value)
      return Number.isFinite(parsed) ? parsed : 0
    }
    if (value && typeof value === "object") {
      return Object.values(value).reduce<number>((acc, child) => acc + sumNumericValues(child), 0)
    }
    return 0
  }

  const isWithinCurrentMonth = (year: number, month: number) =>
    Number.isFinite(year) &&
    Number.isFinite(month) &&
    (year < currentYear || (year === currentYear && month <= currentMonth))

  if (Array.isArray(monthlySpend)) {
    const labelKeys = new Set(["monthYear", "month", "date", "label", "id", "month_label", "monthLabel"])
    return monthlySpend.reduce((total, entry) => {
      if (!entry || typeof entry !== "object") return total
      const monthLabel = entry.monthYear ?? entry.month ?? entry.date ?? entry.label
      const parsed = parseMonthLabel(monthLabel)
      if (!parsed || !isWithinCurrentMonth(parsed.year, parsed.month)) return total

      const entrySum = Object.entries(entry).reduce((acc, [key, value]) => {
        if (labelKeys.has(key)) return acc
        const numericValue = sumNumericValues(value)
        return Number.isFinite(numericValue) ? acc + numericValue : acc
      }, 0)

      return total + entrySum
    }, 0)
  }

  if (monthlySpend && typeof monthlySpend === "object") {
    return Object.entries(monthlySpend).reduce((total, [label, value]) => {
      const parsed = parseMonthLabel(label)
      if (!parsed || !isWithinCurrentMonth(parsed.year, parsed.month)) return total
      const numericValue = sumNumericValues(value)
      return Number.isFinite(numericValue) ? total + numericValue : total
    }, 0)
  }

  return 0
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

function BrandFrame({ children, brandColour }: { children: ReactNode; brandColour?: string }) {
  const gradientStyle = getBrandGradientStyle(brandColour)
  return (
    <div className="overflow-hidden rounded-3xl border border-muted/70 bg-background/90 shadow-sm">
      {gradientStyle ? <div className="h-3" style={gradientStyle} aria-hidden /> : null}
      <div>{children}</div>
    </div>
  )
}

async function fetchCampaignData(mbaNumber: string, version?: string) {
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
  if (version) {
    queryParts.push(`version=${encodeURIComponent(version)}`)
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
    campaignData = await fetchCampaignData(mba_number, version)
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
  
  // Resolve running media types
  const runningMediaTypes = resolveRunningMediaTypes(campaignData, campaign, lineItemsMap)
  
  // Get all line items using resilient getter
  const socialKeys = ["socialMedia", "social", "paidSocial", "social_media", "social_media_line_items"]
  const progDisplayKeys = ["progDisplay", "programmaticDisplay", "dv360Display", "programmatic_display"]
  const progVideoKeys = ["progVideo", "programmaticVideo", "dv360Video", "programmatic_video"]
  
  const socialItems = getLineItems(lineItemsMap, socialKeys)
  const progDisplayItems = getLineItems(lineItemsMap, progDisplayKeys)
  const progVideoItems = getLineItems(lineItemsMap, progVideoKeys)
  
  // Track which keys were actually used (for debug logging)
  let socialKeyUsed: string | null = null
  let progDisplayKeyUsed: string | null = null
  let progVideoKeyUsed: string | null = null
  
  for (const key of socialKeys) {
    if (Array.isArray(lineItemsMap[key])) {
      socialKeyUsed = key
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
  const progDisplayItemsActive = progDisplayItems
  const progVideoItemsActive = progVideoItems
  
  // Build pacingLineItemIds from active arrays (not running-only arrays)
  // Accept multiple id field variations
  const extractLineItemId = (item: any): string | null => {
    if (!item || typeof item !== "object") return null
    const id = item.line_item_id ?? item.lineItemId ?? item.LINE_ITEM_ID
    return id ? String(id) : null
  }
  
  const pacingLineItemIds = Array.from(
    new Set(
      [...socialItemsActive, ...progDisplayItemsActive, ...progVideoItemsActive]
        .map(extractLineItemId)
        .filter((id): id is string => Boolean(id))
    )
  )
  
  // DEBUG logging
  if (DEBUG_PACING) {
    const sampleIds = pacingLineItemIds.slice(0, 5)
    console.log("[PACING DEBUG] Media types and line items", {
      keysUsed: {
        social: socialKeyUsed,
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
        progDisplay: { total: progDisplayItems.length, running: progDisplayItemsRunning.length, active: progDisplayItemsActive.length },
        progVideo: { total: progVideoItems.length, running: progVideoItemsRunning.length, active: progVideoItemsActive.length },
      },
      pacingLineItemIdsCount: pacingLineItemIds.length,
      sampleLineItemIds: sampleIds,
    })
  }
  const debugLineItemCounts = Object.entries(lineItemsMap).map(
    ([key, value]) => `${key}: ${Array.isArray(value) ? value.length : 0}`
  )

  const spendByChannel =
    (metrics.deliverySpendByChannel && metrics.deliverySpendByChannel.length > 0
      ? metrics.deliverySpendByChannel
      : metrics.spendByMediaChannel) || []

  const monthlySpend =
    (metrics.deliveryMonthlySpend && metrics.deliveryMonthlySpend.length > 0
      ? metrics.deliveryMonthlySpend
      : metrics.monthlySpend) || []

  const budget = parseAmountSafe(
    campaign?.campaign_budget || campaign?.mp_campaignbudget || campaign?.total_budget || campaign?.total_media
  )
  const startDate = campaign?.campaign_start_date || campaign?.mp_campaigndates_start
  const endDate = campaign?.campaign_end_date || campaign?.mp_campaigndates_end

  const monthlySpendToDate = deriveSpendToDateFromMonthlySpend(monthlySpend)
  const deliverySpendToDate = deriveSpendToDate(deliverySchedule)
  const actualSpend = (monthlySpendToDate > 0 ? monthlySpendToDate : deliverySpendToDate) || metrics.actualSpendToDate || 0
  if (DEBUG_SPEND) {
    console.log("[Spend Debug] spend to date resolution", {
      monthlySpendToDate,
      deliverySpendToDate,
      metricsActualSpendToDate: metrics.actualSpendToDate,
      used:
        monthlySpendToDate > 0
          ? "monthlySpend"
          : deliverySpendToDate
            ? "deliverySchedule"
            : metrics.actualSpendToDate
              ? "metricsActualSpendToDate"
              : "none",
    })
  }
  const expectedSpendToDate = calculateExpectedSpendToDateFromDeliverySchedule(
    deliverySchedule,
    startDate,
    endDate
  )
  const expectedSpend = expectedSpendToDate || metrics.expectedSpendToDate || 0

  if (DEBUG_SPEND) {
    const monthCount = Array.isArray(deliverySchedule)
      ? deliverySchedule.length
      : Array.isArray(deliverySchedule?.months)
        ? deliverySchedule.months.length
        : 0
    const fallbackPath = expectedSpendToDate
      ? "deliverySchedule"
      : metrics.expectedSpendToDate
        ? "metricsExpectedSpendToDate"
        : "none"

    console.log("[Spend Debug] expected spend resolution", {
      deliveryScheduleMonths: monthCount,
      expectedSpendToDate,
      fallbackPath,
    })
  }

  const initialPacingRows: any[] = []

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

  return (
    <div className="w-full space-y-6 rounded-3xl bg-[#DEE5F4] p-4 pb-40 md:p-6 md:pb-48">
      <BrandFrame brandColour={brandColour}>
        <Suspense fallback={<Skeleton className="h-40 w-full rounded-3xl" />}>
          <CampaignInfoHeader campaign={campaign} />
        </Suspense>
      </BrandFrame>

      <BrandFrame>
        <Suspense fallback={<Skeleton className="h-32 w-full rounded-3xl" />}>
          <CampaignSummaryRow
            time={{
              timeElapsedPct: metrics.timeElapsed,
              daysInCampaign: metrics.daysInCampaign,
              daysElapsed: metrics.daysElapsed,
              daysRemaining: metrics.daysRemaining,
              startDate,
              endDate,
            }}
            spend={{
              budget,
              actualSpend,
              expectedSpend,
            }}
            accentColorTime={brandColour || "#6366f1"}
            accentColorSpend={brandColour || "#8b5cf6"}
            spendCardNode={
              <Suspense fallback={<Skeleton className="h-32 w-full rounded-2xl" />}>
                <ExpectedSpendToDateCard
                  mbaNumber={mba_number}
                  campaignStart={startDate}
                  campaignEnd={endDate}
                  budget={budget}
                  actualSpend={actualSpend}
                  expectedSpend={expectedSpend}
                  deliverySchedule={deliverySchedule}
                  hideStatus
                />
              </Suspense>
            }
            hideStatus
          />
        </Suspense>
      </BrandFrame>

      <Suspense fallback={<Skeleton className="h-[360px] w-full rounded-3xl" />}>
        <SpendChartsRow
          spendByChannel={spendByChannel}
          monthlySpendByChannel={monthlySpend}
          deliverySchedule={deliverySchedule}
        />
      </Suspense>

      <Suspense fallback={<Skeleton className="h-[420px] w-full rounded-3xl" />}>
        <MediaPlanVizSection
          lineItems={lineItemsMap}
          campaignStart={startDate}
          campaignEnd={endDate}
          clientSlug={slug}
          mbaNumber={mba_number}
        />
      </Suspense>

      {pacingLineItemIds.length > 0 ? (
        <Suspense fallback={<Skeleton className="h-[480px] w-full rounded-3xl" />}>
          <PacingDataProviderWrapper
            mbaNumber={mba_number}
            pacingLineItemIds={pacingLineItemIds}
            campaignStart={startDate}
            campaignEnd={endDate}
            clientSlug={slug}
            socialItemsActive={socialItemsActive}
            progDisplayItemsActive={progDisplayItemsActive}
            progVideoItemsActive={progVideoItemsActive}
          />
        </Suspense>
      ) : (
        <>
          {socialItemsActive.length > 0 ? (
            <Suspense fallback={<Skeleton className="h-[480px] w-full rounded-3xl" />}>
              <SocialPacingContainer
                clientSlug={slug}
                mbaNumber={mba_number}
                socialLineItems={socialItemsActive}
                campaignStart={startDate}
                campaignEnd={endDate}
                initialPacingRows={undefined}
                pacingLineItemIds={pacingLineItemIds}
              />
            </Suspense>
          ) : null}

          {(progDisplayItemsActive.length > 0 || progVideoItemsActive.length > 0) ? (
            <Suspense fallback={<Skeleton className="h-[480px] w-full rounded-3xl" />}>
              <ProgrammaticPacingContainer
                clientSlug={slug}
                mbaNumber={mba_number}
                progDisplayLineItems={progDisplayItemsActive}
                progVideoLineItems={progVideoItemsActive}
                campaignStart={startDate}
                campaignEnd={endDate}
                initialPacingRows={undefined}
                pacingLineItemIds={pacingLineItemIds}
              />
            </Suspense>
          ) : null}
        </>
      )}

      {DEBUG_LINE_ITEMS ? (
        <div className="rounded-2xl border border-dashed border-muted/70 bg-background/80 p-3 text-sm text-muted-foreground">
          <div className="font-semibold text-foreground mb-1">Line item debug</div>
          <ul className="space-y-1">
            {debugLineItemCounts.length
              ? debugLineItemCounts.map((entry) => <li key={entry}>{entry}</li>)
              : <li>No line items loaded</li>}
          </ul>
        </div>
      ) : null}

      <CampaignActions mbaNumber={mba_number} campaign={campaign} lineItems={lineItemsMap} billingSchedule={billingSchedule} />
    </div>
  )
}
