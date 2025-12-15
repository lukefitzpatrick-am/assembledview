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


export async function GET(
  request: Request,
  { params }: { params: Promise<{ mba_number: string }> }
) {
  try {
    const { mba_number } = await params
    
    // Fetch media plan version data (similar to existing MBA route)
    const masterQueryUrl = `${MEDIA_PLAN_MASTER_URL}/media_plan_master?mba_number=${encodeURIComponent(mba_number)}`
    const masterResponse = await axios.get(masterQueryUrl)
    
    let masterData: any = null
    if (Array.isArray(masterResponse.data)) {
      masterData = masterResponse.data.find((item: any) => item.mba_number === mba_number)
      if (!masterData && masterResponse.data.length > 0) {
        masterData = masterResponse.data[0]
      }
    } else {
      masterData = masterResponse.data
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
    
    let versionData: any = null
    if (Array.isArray(versionResponse.data)) {
      // Filter by mba_number AND master_id first, then by version_number
      const allVersionsForMBA = versionResponse.data.filter((item: any) => 
        item.mba_number === mba_number && item.media_plan_master_id === masterData.id
      )
      // Find the version matching masterData.version_number
      versionData = allVersionsForMBA.find((item: any) => {
        const itemVersion = typeof item.version_number === 'string' 
          ? parseInt(item.version_number, 10) 
          : item.version_number
        const targetVersion = typeof masterData.version_number === 'string'
          ? parseInt(masterData.version_number, 10)
          : masterData.version_number
        return itemVersion === targetVersion
      })
    } else {
      // Single object response - validate it matches mba_number, master_id, and version_number
      if (versionResponse.data.mba_number === mba_number && versionResponse.data.media_plan_master_id === masterData.id) {
        const itemVersion = typeof versionResponse.data.version_number === 'string' 
          ? parseInt(versionResponse.data.version_number, 10) 
          : versionResponse.data.version_number
        const targetVersion = typeof masterData.version_number === 'string'
          ? parseInt(masterData.version_number, 10)
          : masterData.version_number
        if (itemVersion === targetVersion) {
          versionData = versionResponse.data
        }
      }
    }
    
    if (!versionData) {
      return NextResponse.json(
        { error: "Media plan version not found" },
        { status: 404 }
      )
    }
    
    // Fetch all line items
    const lineItems = await fetchAllMediaContainerLineItems(
      mba_number,
      masterData.version_number
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
      { [mba_number]: masterData.version_number }
    )
    
    // Use media container function to get monthly spend by media type
    const monthlySpend = await aggregateMonthlySpendByMediaType(
      [mba_number],
      { [mba_number]: masterData.version_number }
    )
    
    // Prepare response
    const response = {
      campaign: {
        ...versionData,
        mbaNumber: mba_number,
        versionNumber: masterData.version_number
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
