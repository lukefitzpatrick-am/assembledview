import { NextRequest, NextResponse } from "next/server"
import axios from "axios"
import {
  formatInvoiceDate,
  extractLineItemsFromBillingSchedule,
  extractServiceAmountsFromBillingSchedule,
  mergeFinanceLineItems,
  financeClientNamesMatch,
} from "@/lib/finance/utils"
import { xanoUrl } from "@/lib/api/xano"
import { fetchRelevantPlanVersionsForFinanceMonth } from "@/lib/finance/relevantPlanVersions"


export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const monthParam = searchParams.get("month") // Format: YYYY-MM
    const clientFilterRaw = searchParams.get("client")
    const clientFilter = clientFilterRaw ? decodeURIComponent(clientFilterRaw.trim()) : ""

    if (!monthParam) {
      return NextResponse.json(
        { error: "Month parameter is required (format: YYYY-MM)" },
        { status: 400 }
      )
    }

    const versionsResult = await fetchRelevantPlanVersionsForFinanceMonth(monthParam)
    if ("error" in versionsResult) {
      return NextResponse.json({ error: versionsResult.error }, { status: versionsResult.status })
    }

    const { year, month, allVersions, relevantVersions } = versionsResult

    // Fetch clients and publishers in parallel
    const [clientsResponse, publishersResponse] = await Promise.all([
      axios.get(xanoUrl("get_clients", "XANO_CLIENTS_BASE_URL")).catch(() => ({ data: [] })),
      axios.get(xanoUrl("get_publishers", "XANO_PUBLISHERS_BASE_URL")).catch(() => ({ data: [] })),
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

      // Merge duplicates within this MBA by exact match on (itemCode, mediaType, description)
      const mergedLineItems = mergeFinanceLineItems(financeLineItems)

      // Extract service amounts from billing schedule
      const serviceAmounts = extractServiceAmountsFromBillingSchedule(
        billingSchedule,
        year,
        month
      )

      // Calculate total campaign amount (line items + services)
      const totalLineItemsAmount = mergedLineItems.reduce((sum, item) => sum + item.amount, 0)
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
      const hasAdvertisingAssociates = mergedLineItems.some((li) => li.itemCode.startsWith("G."))
      const hasAssembledMedia = mergedLineItems.some((li) => li.itemCode.startsWith("D."))

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
        lineItems: mergedLineItems,
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

    const filterByClient = (list: typeof bookedApprovedCampaigns) => {
      if (!clientFilter) return list
      return list.filter((c) => financeClientNamesMatch(c.clientName, clientFilter))
    }

    const bookedFiltered = filterByClient(bookedApprovedCampaigns)
    const otherFiltered = filterByClient(otherCampaigns)

    const meta = {
      selectedMonth: monthParam,
      clientFilter: clientFilter || undefined,
      totalVersions: allVersions.length,
      relevantVersions: relevantVersions.length,
      bookedApprovedCount: bookedFiltered.length,
      otherCount: otherFiltered.length,
      notice:
        bookedFiltered.length === 0 && otherFiltered.length === 0
          ? "No finance data after filtering latest versions, date overlap, and zero-amount totals."
          : undefined,
    }

    return NextResponse.json({
      bookedApproved: bookedFiltered,
      other: otherFiltered,
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

