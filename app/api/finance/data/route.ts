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
  buildProductionServiceRows,
  productionLineMonthAmounts,
  type ProductionPlanLine,
} from "@/lib/finance/financeExportProductionRows"
import { loadProductionPlanLinesForVersions } from "@/lib/finance/loadProductionPlanLines"
import {
  isAdvertisingAssociatesPublisher,
  publisherResolver,
} from "@/lib/mediaplan/advertisingAssociatesExcel"
import type { Publisher } from "@/lib/types/publisher"

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

    const publisherMap = new Map<string, Record<string, unknown>>()
    publishers.forEach((publisher) => {
      const name = String(publisher.publisher_name || "").trim()
      if (name) publisherMap.set(name, publisher)
    })

    // Production publisher per line, for splitting production across G./D. codes.
    const resolvePublisher = publisherResolver(publishers as unknown as Publisher[])
    const billsViaAdvertisingAssociates = (name: string) => {
      const pub = resolvePublisher(name)
      return pub ? isAdvertisingAssociatesPublisher(pub) : false
    }
    let productionLinesByVersion = new Map<number, ProductionPlanLine[]>()
    try {
      productionLinesByVersion = await loadProductionPlanLinesForVersions(
        relevantVersions.map((v) => Number(v.id ?? v.version_id ?? 0))
      )
    } catch (err) {
      console.error("[finance-data] failed to load production lines; production goes to one code", err)
    }

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

      const hasAdvertisingAssociates = mergedLineItems.some((li) => li.itemCode.startsWith("G."))
      const hasAssembledMedia = mergedLineItems.some((li) => li.itemCode.startsWith("D."))

      // Both codes: split production by production publisher (never the full
      // amount under both). One code: the full amount under it.
      serviceRows.push(
        ...buildProductionServiceRows({
          production: serviceAmounts.production,
          hasAdvertisingAssociates,
          hasAssembledMedia,
          lineAmounts:
            hasAdvertisingAssociates && hasAssembledMedia
              ? productionLineMonthAmounts({
                  billingSchedule,
                  year,
                  month,
                  lines:
                    productionLinesByVersion.get(
                      Number(version.id ?? version.version_id ?? 0)
                    ) ?? [],
                })
              : [],
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
