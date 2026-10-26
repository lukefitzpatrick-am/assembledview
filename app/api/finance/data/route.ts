import { NextRequest, NextResponse } from "next/server"
import {
  formatInvoiceDate,
  extractServiceAmountsFromBillingSchedule,
  mergeFinanceLineItems,
  financeClientNamesMatch,
} from "@/lib/finance/utils"
import { fetchRelevantPlanVersionsForFinanceMonth } from "@/lib/finance/relevantPlanVersions"
import { resolveFinanceCampaignStatus } from "@/lib/finance/sections/financeCampaignStatus"
import { hydrateVersionsFinanceScheduleSource } from "@/lib/finance/scheduleMonthsSource"
import {
  extractFinanceExportMediaLines,
  getFinancePlanLinesById,
} from "@/lib/finance/financeScheduleHeaders"
import { requireFinanceAdmin } from "@/lib/requireRole"
import { readClientsList } from "@/lib/data/readClients"
import { readPublishersList } from "@/lib/data/readPublishers"
import {
  getFinanceProductionLines,
  productionPlanLinesFromBillingMonth,
  productionServiceRowsForMonth,
} from "@/lib/finance/financeExportProductionRows"
import { type PublisherIdentityRow } from "@/lib/publisher/publisherUniqueness"
import {
  createBillsViaAdvertisingAssociates,
  createPublisherLookup,
} from "@/lib/publisher/resolvePublisherName"

export const maxDuration = 60

function asRecordList(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[]
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>
    if (Array.isArray(o.items)) return o.items as Record<string, unknown>[]
    if (Array.isArray(o.data)) return o.data as Record<string, unknown>[]
  }
  return []
}

/**
 * GET /api/finance/data?month=YYYY-MM&client=
 * Legacy hub Excel export — versions via DATA_BACKEND_PLANS readers,
 * clients/publishers via DATA_BACKEND_CLIENTS / PUBLISHERS (X3).
 */
export async function GET(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response

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
    await hydrateVersionsFinanceScheduleSource(relevantVersions)

    const [clientsRes, publishersRes] = await Promise.all([
      readClientsList(),
      readPublishersList(),
    ])
    const clients = asRecordList(clientsRes.body)
    const publishers = asRecordList(publishersRes.body)

    const clientMap = new Map<string, Record<string, unknown>>()
    clients.forEach((client) => {
      const name = String(
        client.clientname_input || client.mp_client_name || client.name || ""
      ).trim()
      if (name) clientMap.set(name, client)
    })

    // Media line G./D. lookup: the shared resolver, same as the production
    // split (trimmed, case-insensitive, lowest id, alias, then publisherid).
    const publisherMap = createPublisherLookup(
      publishers as unknown as Array<PublisherIdentityRow & Record<string, unknown>>
    )

    // Production publisher per line, for splitting production across G./D.
    // codes. Same resolver and rule as receivables derive (Send to accounts,
    // Clients billing review download). Lines are attached by hydrate.
    const billsViaAdvertisingAssociates = createBillsViaAdvertisingAssociates(
      publishers as unknown as PublisherIdentityRow[]
    )

    const bookedApprovedCampaigns: Record<string, unknown>[] = []
    const otherCampaigns: Record<string, unknown>[] = []

    for (const version of relevantVersions) {
      const mbaNumber = version.mba_number
      const clientName = version.mp_client_name || version.campaign_name
      const client = clientName ? clientMap.get(String(clientName)) : null

      let billingSchedule: unknown = null
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

      // Old mediaTypes months: unchanged extractor. lineItems months: core
      // converter with placeholder headers relabelled from the plan line.
      const financeLineItems = extractFinanceExportMediaLines(
        billingSchedule,
        year,
        month,
        publisherMap,
        getFinancePlanLinesById(version as Record<string, unknown>)
      )
      const mergedLineItems = mergeFinanceLineItems(financeLineItems)
      const serviceAmounts = extractServiceAmountsFromBillingSchedule(
        billingSchedule,
        year,
        month
      )

      const totalLineItemsAmount = mergedLineItems.reduce((sum, item) => sum + item.amount, 0)
      const totalServicesAmount =
        serviceAmounts.adservingTechFees +
        serviceAmounts.production +
        serviceAmounts.assembledFee
      const totalCampaignAmount = totalLineItemsAmount + totalServicesAmount
      if (totalCampaignAmount === 0) continue

      const serviceRows: Record<string, unknown>[] = []
      serviceRows.push({
        itemCode: "T.Adserving",
        service: "Adserving and Tech Fees",
        amount: serviceAmounts.adservingTechFees,
      })

      // One production rule for every finance output (productionServiceRowsForMonth):
      // one media code = full production under it; both codes or no media =
      // split by production publisher. Never the full amount under both.
      serviceRows.push(
        ...productionServiceRowsForMonth({
          production: serviceAmounts.production,
          mediaItemCodes: mergedLineItems.map((li) => li.itemCode),
          billingSchedule,
          year,
          month,
          lines:
            getFinanceProductionLines(version as Record<string, unknown>) ??
            productionPlanLinesFromBillingMonth(billingSchedule, year, month),
          billsViaAdvertisingAssociates,
        }).map((row) => ({ ...row }))
      )

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

      const status = resolveFinanceCampaignStatus(version as Record<string, unknown>)
      if (status === "booked" || status === "approved") {
        bookedApprovedCampaigns.push(campaignData)
      } else {
        otherCampaigns.push(campaignData)
      }
    }

    const filterByClient = (list: typeof bookedApprovedCampaigns) => {
      if (!clientFilter) return list
      return list.filter((c) =>
        financeClientNamesMatch(String(c.clientName ?? ""), clientFilter)
      )
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
  } catch (error: unknown) {
    console.error("Error fetching finance data:", error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: "Failed to fetch finance data", details: message },
      { status: 500 }
    )
  }
}
