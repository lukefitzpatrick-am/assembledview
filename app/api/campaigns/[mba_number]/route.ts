import { NextResponse } from "next/server"
import axios from "axios"
import { fetchAllMediaContainerLineItems, getSpendByMediaTypeFromLineItems, aggregateMonthlySpendByMediaType } from "@/lib/api/media-containers"
import { buildBillingScheduleJSON } from "@/lib/billing/buildBillingSchedule"
import type { BillingMonth } from "@/lib/billing/types"

const MEDIA_PLANS_VERSIONS_URL = "https://xg4h-uyzs-dtex.a2.xano.io/api:RaUx9FOa"
const MEDIA_PLAN_MASTER_URL = "https://xg4h-uyzs-dtex.a2.xano.io/api:RaUx9FOa"

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

// Safely parse a version number that might be a string or number
function parseVersionNumber(value: any): number | null {
  if (value === null || value === undefined) return null
  const num = typeof value === "string" ? parseInt(value, 10) : value
  return Number.isFinite(num) ? num : null
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


export async function GET(
  request: Request,
  { params }: { params: Promise<{ mba_number: string }> }
) {
  try {
    const { mba_number } = await params
    const requestedNormalized = normalize(mba_number)
    
    // Fetch media plan version data (similar to existing MBA route)
    const masterQueryUrl = `${MEDIA_PLAN_MASTER_URL}/media_plan_master?mba_number=${encodeURIComponent(mba_number)}`
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
    
    // Get the latest version - query ONLY by mba_number to scan entire database
    // Then filter by version_number in JavaScript
    const versionQueryUrl = `${MEDIA_PLANS_VERSIONS_URL}/media_plan_versions?mba_number=${encodeURIComponent(mba_number)}`
    const versionResponse = await axios.get(versionQueryUrl)

    // Collect versions and optionally fall back to master_id query if mba filter returns nothing
    const collectedVersions: any[] = Array.isArray(versionResponse.data) ? versionResponse.data : []
    if (collectedVersions.length === 0 && masterData?.id !== undefined) {
      try {
        const fallbackUrl = `${MEDIA_PLANS_VERSIONS_URL}/media_plan_versions?media_plan_master_id=${encodeURIComponent(masterData.id)}`
        const fallbackResponse = await axios.get(fallbackUrl)
        const fallbackData = Array.isArray(fallbackResponse.data) ? fallbackResponse.data : []
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
      // Filter by mba_number AND master_id first, then by version_number
      let allVersionsForMBA = collectedVersions.filter((item: any) => 
        normalize(item?.mba_number) === requestedNormalized && matchesMasterId(item.media_plan_master_id, masterData.id)
      )

      // If none matched both mba and master, fall back to master match only
      if (allVersionsForMBA.length === 0) {
        allVersionsForMBA = collectedVersions.filter((item: any) =>
          matchesMasterId(item?.media_plan_master_id, masterData.id)
        )
      }

      // Determine target version: prefer master's version_number, otherwise latest available
      const targetVersionNumber = parseVersionNumber(masterData.version_number)
      const latestVersion = allVersionsForMBA.reduce((latest: any, item: any) => {
        const itemVersion = parseVersionNumber(item.version_number) ?? -Infinity
        if (!latest) return item
        const latestVersionValue = parseVersionNumber(latest.version_number) ?? -Infinity
        return itemVersion > latestVersionValue ? item : latest
      }, null as any)

      // Try to match the target version, fall back to the latest for this MBA/master
      versionData = allVersionsForMBA.find((item: any) => 
        parseVersionNumber(item.version_number) === targetVersionNumber
      ) || latestVersion || null
    } else {
      // Single object response - validate it matches mba_number, master_id, and version_number
      const single = versionResponse.data
      const mbaMatches = normalize(single?.mba_number) === requestedNormalized
      const masterMatches = matchesMasterId(single?.media_plan_master_id, masterData.id)
      if (mbaMatches && masterMatches) {
        const itemVersion = parseVersionNumber(single.version_number)
        const targetVersion = parseVersionNumber(masterData.version_number)
        if (!targetVersion || itemVersion === targetVersion) {
          versionData = single
        }
      }
    }
    
    if (!versionData) {
      return NextResponse.json(
        { error: "Media plan version not found" },
        { status: 404 }
      )
    }

    // Use the resolved version number (fall back to master's version or 1)
    const versionNumber = parseVersionNumber(versionData?.version_number) 
      ?? parseVersionNumber(masterData.version_number) 
      ?? 1
    
    // Fetch all line items
    const lineItems = await fetchAllMediaContainerLineItems(
      mba_number,
      versionNumber
    )
    
    // Extract billing schedule
    let billingSchedule: any = null
    if (versionData.billingSchedule) {
      try {
        billingSchedule = typeof versionData.billingSchedule === "string"
          ? JSON.parse(versionData.billingSchedule)
          : versionData.billingSchedule
      } catch (e) {
        console.warn("Failed to parse billing schedule:", e)
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
    
    // Use media container functions to get spend by media channel
    const spendByMediaChannel = await getSpendByMediaTypeFromLineItems(
      [mba_number],
      { [mba_number]: versionNumber }
    )
    
    // Use media container function to get monthly spend by media type
    const monthlySpend = await aggregateMonthlySpendByMediaType(
      [mba_number],
      { [mba_number]: versionNumber }
    )
    
    // Prepare response
    const response = {
      campaign: {
        ...versionData,
        mbaNumber: mba_number,
        versionNumber
      },
      lineItems,
      billingSchedule,
      metrics: {
        timeElapsed,
        expectedSpendToDate,
        spendByMediaChannel,
        monthlySpend
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
