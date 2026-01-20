import dynamic from "next/dynamic"
import { Suspense, type ReactNode } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import CampaignActions from "./components/CampaignActions"
import ExpectedSpendToDateCard from "./components/ExpectedSpendToDateCard"
import { auth0 } from "@/lib/auth0"
import { getPrimaryRole, getUserClientIdentifier } from "@/lib/rbac"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { getCampaignPacingData } from "@/lib/snowflake/pacing-service"
import { checkConnectionHealth } from "@/lib/snowflake/pool"
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
const DEBUG_SNOWFLAKE = process.env.NEXT_PUBLIC_DEBUG_SNOWFLAKE === "true"

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

  if (role === "client" && userClientSlug && userClientSlug !== slug) {
    redirect(`/dashboard/${userClientSlug}`)
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
  const socialItems = Array.isArray(lineItemsMap.socialMedia) ? lineItemsMap.socialMedia : []
  const progDisplayItems = Array.isArray(lineItemsMap.progDisplay) ? lineItemsMap.progDisplay : []
  const progVideoItems = Array.isArray(lineItemsMap.progVideo) ? lineItemsMap.progVideo : []
  const pacingLineItemIds = Array.from(
    new Set(
      [...socialItems, ...progDisplayItems, ...progVideoItems]
        .map((item) => item?.line_item_id)
        .filter(Boolean)
        .map((id) => String(id))
    )
  )
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

  // ============================================================================
  // OPTIMIZED: Smart pacing data fetch with date range calculation and logging
  // ============================================================================
  let initialPacingRows: any[] = []
  if (pacingLineItemIds.length > 0) {
    // Smart date range calculation
    const MAX_RANGE_DAYS = 180
    const DEFAULT_RANGE_DAYS = 90
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    let pacingStartDate: string
    let pacingEndDate: string

    // Calculate end date: use campaign end date or today, whichever is earlier
    if (endDate) {
      const campaignEnd = new Date(endDate)
      campaignEnd.setHours(0, 0, 0, 0)
      pacingEndDate = (campaignEnd <= today ? campaignEnd : today).toISOString().slice(0, 10)
    } else {
      pacingEndDate = today.toISOString().slice(0, 10)
    }

    // Calculate start date: use campaign start date or default to 90 days ago
    if (startDate) {
      const campaignStart = new Date(startDate)
      campaignStart.setHours(0, 0, 0, 0)
      pacingStartDate = campaignStart.toISOString().slice(0, 10)
    } else {
      // Default to 90 days ago if no campaign start date
      const defaultStart = new Date(today.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000)
      pacingStartDate = defaultStart.toISOString().slice(0, 10)
    }

    // Clamp to max 180 days to prevent excessive queries
    const startDateObj = new Date(pacingStartDate)
    const endDateObj = new Date(pacingEndDate)
    const rangeDays = Math.ceil((endDateObj.getTime() - startDateObj.getTime()) / (24 * 60 * 60 * 1000))
    if (rangeDays > MAX_RANGE_DAYS) {
      const clampedStart = new Date(endDateObj.getTime() - MAX_RANGE_DAYS * 24 * 60 * 60 * 1000)
      pacingStartDate = clampedStart.toISOString().slice(0, 10)
    }

    // =========================================================================
    // HEALTH CHECK: DEBUG ONLY - Log Snowflake connectivity status
    // Disabled by default to avoid consuming pool capacity before pacing fetch
    // Enable with NEXT_PUBLIC_DEBUG_SNOWFLAKE=true for diagnostics
    // =========================================================================
    let healthCheckResult: { healthy: boolean; error?: string } | null = null
    
    if (DEBUG_SNOWFLAKE) {
      const healthCheckStart = performance.now()
      try {
        const result = await checkConnectionHealth()
        healthCheckResult = { healthy: result.healthy, error: result.error }
        
        logPerf("Snowflake health check", healthCheckStart, {
          healthy: result.healthy,
          acquireMs: result.acquireMs,
          queryMs: result.queryMs,
          totalMs: result.totalMs,
          error: result.error,
        })
        
        if (!result.healthy) {
          console.warn("[SSR Pacing] Snowflake health check failed (will still attempt pacing fetch)", {
            mba_number,
            error: result.error,
            totalMs: result.totalMs,
          })
        }
      } catch (healthErr) {
        // Health check itself threw an error (shouldn't happen, but be safe)
        healthCheckResult = { healthy: false, error: healthErr instanceof Error ? healthErr.message : String(healthErr) }
        logPerf("Snowflake health check (error)", healthCheckStart, {
          error: healthCheckResult.error,
        })
        console.warn("[SSR Pacing] Snowflake health check error (will still attempt pacing fetch)", {
          mba_number,
          error: healthCheckResult.error,
        })
      }
    }

    // =========================================================================
    // PACING FETCH: Always attempt regardless of health check result
    // =========================================================================
    const pacingFetchStart = performance.now()

    try {
      initialPacingRows = await getCampaignPacingData(
        mba_number,
        pacingLineItemIds,
        pacingStartDate,
        pacingEndDate
      )

      // Log performance with channel breakdown
      const channelCounts = initialPacingRows.reduce((acc, row) => {
        const channel = row.channel ?? "unknown"
        acc[channel] = (acc[channel] ?? 0) + 1
        return acc
      }, {} as Record<string, number>)

      logPerf("Pacing data fetch", pacingFetchStart, {
        mba: mba_number,
        lineItems: pacingLineItemIds.length,
        rows: initialPacingRows.length,
        dateRange: `${pacingStartDate} to ${pacingEndDate}`,
        channels: channelCounts,
        healthCheckPassed: healthCheckResult?.healthy ?? "not_run",
      })

      // =========================================================================
      // SANITY LOG: Alert when we expected data but got none
      // Helps diagnose date-range mismatch vs data actually missing
      // =========================================================================
      if (initialPacingRows.length === 0) {
        console.warn("[SSR Pacing] Query returned 0 rows despite having line items", {
          mba_number,
          lineItemCount: pacingLineItemIds.length,
          sampleLineItemIds: pacingLineItemIds.slice(0, 5),
          dateRange: { start: pacingStartDate, end: pacingEndDate },
          healthCheckPassed: healthCheckResult?.healthy ?? "not_run",
          healthCheckError: healthCheckResult?.error,
        })
      }
    } catch (err) {
      // Log failed fetch with health check context
      logPerf("Pacing data fetch (failed)", pacingFetchStart, {
        mba: mba_number,
        lineItems: pacingLineItemIds.length,
        error: err instanceof Error ? err.message : String(err),
        healthCheckPassed: healthCheckResult?.healthy ?? "not_run",
      })
      console.error("[SSR Pacing] Query failed", {
        mba_number,
        lineItemCount: pacingLineItemIds.length,
        sampleLineItemIds: pacingLineItemIds.slice(0, 5),
        dateRange: { start: pacingStartDate, end: pacingEndDate },
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        healthCheckPassed: healthCheckResult?.healthy ?? "not_run",
        healthCheckError: healthCheckResult?.error,
      })
      // Graceful fallback - page should still render without pacing data
      initialPacingRows = []
    }
  }

  // Log total SSR time
  pageTimer.total({
    mba: mba_number,
    hasError: !!error,
    pacingRows: initialPacingRows.length,
    lineItemCounts: {
      social: socialItems.length,
      progDisplay: progDisplayItems.length,
      progVideo: progVideoItems.length,
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

      {socialItems.length ? (
        <Suspense fallback={<Skeleton className="h-[480px] w-full rounded-3xl" />}>
          <SocialPacingContainer
            clientSlug={slug}
            mbaNumber={mba_number}
            socialLineItems={socialItems}
            campaignStart={startDate}
            campaignEnd={endDate}
            initialPacingRows={initialPacingRows}
          />
        </Suspense>
      ) : null}

      {(progDisplayItems.length || progVideoItems.length) ? (
        <Suspense fallback={<Skeleton className="h-[480px] w-full rounded-3xl" />}>
          <ProgrammaticPacingContainer
            clientSlug={slug}
            mbaNumber={mba_number}
            progDisplayLineItems={progDisplayItems}
            progVideoLineItems={progVideoItems}
            campaignStart={startDate}
            campaignEnd={endDate}
            initialPacingRows={initialPacingRows}
          />
        </Suspense>
      ) : null}

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
