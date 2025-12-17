import { NextRequest, NextResponse } from "next/server"
import axios from "axios"
import {
  campaignOverlapsMonth,
  formatInvoiceDate,
  extractLineItemsFromBillingSchedule,
  extractServiceAmountsFromBillingSchedule,
} from "@/lib/finance/utils"

const MEDIA_PLAN_MASTER_URL = process.env.XANO_MEDIA_PLANS_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:RaUx9FOa"
const MEDIA_PLANS_VERSIONS_URL = process.env.XANO_MEDIA_PLANS_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:RaUx9FOa"
const CLIENTS_BASE_URL = process.env.XANO_CLIENTS_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:9v_k2NR8"
const PUBLISHERS_BASE_URL = process.env.XANO_PUBLISHERS_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:YkRK8qLP"


export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const monthParam = searchParams.get("month") // Format: YYYY-MM

    if (!monthParam) {
      return NextResponse.json(
        { error: "Month parameter is required (format: YYYY-MM)" },
        { status: 400 }
      )
    }

    const [year, month] = monthParam.split("-").map(Number)
    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json(
        { error: "Invalid month format. Use YYYY-MM" },
        { status: 400 }
      )
    }

    // Fetch all media plan masters to get latest version numbers
    const mastersResponse = await axios.get(`${MEDIA_PLAN_MASTER_URL}/media_plan_master`)
    const masters = Array.isArray(mastersResponse.data) ? mastersResponse.data : []

    // Create a map of MBA number to latest version info (use masters first, then fallback to versions)
    const mbaToVersionMap = new Map<string, { masterId?: number; versionNumber: number }>()
    masters.forEach((master: any) => {
      if (master.mba_number && master.version_number) {
        const versionNumber = Number(master.version_number) || 0
        const existing = mbaToVersionMap.get(master.mba_number)
        if (!existing || versionNumber > existing.versionNumber) {
          mbaToVersionMap.set(master.mba_number, {
            masterId: master.id,
            versionNumber,
          })
        }
      }
    })

    // Fetch all media plan versions
    const versionsResponse = await axios.get(`${MEDIA_PLANS_VERSIONS_URL}/media_plan_versions`)
    const allVersions = Array.isArray(versionsResponse.data) ? versionsResponse.data : []

    // Ensure we have latest version info even if master entry is missing
    allVersions.forEach((version: any) => {
      if (!version.mba_number) return
      const versionNumber = Number(version.version_number) || 0
      const existing = mbaToVersionMap.get(version.mba_number)
      if (!existing || versionNumber > existing.versionNumber) {
        mbaToVersionMap.set(version.mba_number, {
          masterId: version.media_plan_master_id,
          versionNumber,
        })
      }
    })

    // Filter to only latest versions that overlap with selected month
    const relevantVersions = allVersions.filter((version: any) => {
      if (!version.mba_number) return false
      const versionInfo = mbaToVersionMap.get(version.mba_number)
      if (!versionInfo) return false

      const isLatestVersionNumber =
        Number(version.version_number) === Number(versionInfo.versionNumber)

      // If master id is present in both, ensure it matches; otherwise rely on version number only
      const masterIdMatches =
        !version.media_plan_master_id ||
        !versionInfo.masterId ||
        version.media_plan_master_id === versionInfo.masterId

      if (!isLatestVersionNumber || !masterIdMatches) {
        return false
      }

      // Check if campaign dates overlap with selected month
      if (version.campaign_start_date && version.campaign_end_date) {
        return campaignOverlapsMonth(
          version.campaign_start_date,
          version.campaign_end_date,
          year,
          month
        )
      }
      return false
    })

    // Fetch clients and publishers in parallel
    const [clientsResponse, publishersResponse] = await Promise.all([
      axios.get(`${CLIENTS_BASE_URL}/get_clients`).catch(() => ({ data: [] })),
      axios.get(`${PUBLISHERS_BASE_URL}/get_publishers`).catch(() => ({ data: [] })),
    ])

    const clients = Array.isArray(clientsResponse.data) ? clientsResponse.data : []
    const publishers = Array.isArray(publishersResponse.data) ? publishersResponse.data : []

    // Create lookup maps
    const clientMap = new Map<string, any>()
    clients.forEach((client: any) => {
      const name = client.clientname_input || client.mp_client_name || client.name
      if (name) {
        clientMap.set(name, client)
      }
    })

    const publisherMap = new Map<string, any>()
    publishers.forEach((publisher: any) => {
      const name = publisher.publisher_name
      if (name) {
        publisherMap.set(name, publisher)
      }
    })

    // Process each campaign
    const bookedApprovedCampaigns: any[] = []
    const otherCampaigns: any[] = []

    for (const version of relevantVersions) {
      const mbaNumber = version.mba_number

      // Get client info
      const clientName = version.mp_client_name || version.campaign_name
      const client = clientName ? clientMap.get(clientName) : null

      // Try to extract billing schedule from version
      let billingSchedule: any = null
      if (version.billingSchedule) {
        try {
          billingSchedule =
            typeof version.billingSchedule === "string"
              ? JSON.parse(version.billingSchedule)
              : version.billingSchedule
        } catch (e) {
          console.warn("Failed to parse billing schedule:", e)
        }
      }

      // Extract line items from billing schedule JSON
      const financeLineItems = extractLineItemsFromBillingSchedule(
        billingSchedule,
        year,
        month,
        publisherMap
      )

      // Extract service amounts from billing schedule
      const serviceAmounts = extractServiceAmountsFromBillingSchedule(
        billingSchedule,
        year,
        month
      )

      // Calculate total campaign amount (line items + services)
      const totalLineItemsAmount = financeLineItems.reduce((sum, item) => sum + item.amount, 0)
      const totalServicesAmount =
        serviceAmounts.adservingTechFees +
        serviceAmounts.production +
        serviceAmounts.assembledFee
      const totalCampaignAmount = totalLineItemsAmount + totalServicesAmount

      // Skip campaigns with $0 spend
      if (totalCampaignAmount === 0) continue

      // Build service rows
      const serviceRows: any[] = []

      // T.Adserving - Adserving and Tech Fees
      serviceRows.push({
        itemCode: "T.Adserving",
        service: "Adserving and Tech Fees",
        amount: serviceAmounts.adservingTechFees,
      })

      // Production - check if we have both agencies
      const hasAdvertisingAssociates = financeLineItems.some((li) => li.itemCode.startsWith("G."))
      const hasAssembledMedia = financeLineItems.some((li) => li.itemCode.startsWith("D."))

      if (hasAdvertisingAssociates) {
        serviceRows.push({
          itemCode: "G.Production",
          service: "Production",
          amount: serviceAmounts.production,
        })
      }
      if (hasAssembledMedia) {
        serviceRows.push({
          itemCode: "D.Production",
          service: "Production",
          amount: serviceAmounts.production,
        })
      }

      // Service - Assembled Fee
      serviceRows.push({
        itemCode: "Service",
        service: "Assembled Fee",
        amount: serviceAmounts.assembledFee,
      })

      const campaignData = {
        clientName: clientName || "Unknown",
        mbaNumber: mbaNumber,
        poNumber: version.po_number || "",
        campaignName: version.campaign_name || "Unknown Campaign",
        paymentDays: client?.payment_days || 30,
        paymentTerms: client?.payment_terms || "Net 30 days",
        invoiceDate: formatInvoiceDate(year, month),
        lineItems: financeLineItems,
        serviceRows: serviceRows,
        total: totalCampaignAmount,
      }

      // Separate by status
      const status = (version.campaign_status || "").toLowerCase()
      if (status === "booked" || status === "approved") {
        bookedApprovedCampaigns.push(campaignData)
      } else {
        otherCampaigns.push(campaignData)
      }
    }

    const meta = {
      selectedMonth: monthParam,
      totalVersions: allVersions.length,
      relevantVersions: relevantVersions.length,
      bookedApprovedCount: bookedApprovedCampaigns.length,
      otherCount: otherCampaigns.length,
      notice:
        bookedApprovedCampaigns.length === 0 && otherCampaigns.length === 0
          ? "No finance data after filtering latest versions, date overlap, and zero-amount totals."
          : undefined,
    }

    return NextResponse.json({
      bookedApproved: bookedApprovedCampaigns,
      other: otherCampaigns,
      meta,
    })
  } catch (error: any) {
    console.error("Error fetching finance data:", error)
    return NextResponse.json(
      { error: "Failed to fetch finance data", details: error.message },
      { status: 500 }
    )
  }
}

