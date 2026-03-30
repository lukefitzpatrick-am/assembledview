import { NextRequest, NextResponse } from "next/server"
import { fetchRelevantPlanVersionsForFinanceMonth } from "@/lib/finance/relevantPlanVersions"
import {
  aggregatePublisherInvoiceContributions,
  extractPublisherBillableMediaFromBillingSchedule,
  type PublisherInvoiceContribution,
} from "@/lib/finance/publisherInvoiceReport"

export async function GET(request: NextRequest) {
  try {
    const monthParam = request.nextUrl.searchParams.get("month")
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

    const contributionsBooked: PublisherInvoiceContribution[] = []
    const contributionsOther: PublisherInvoiceContribution[] = []

    for (const version of relevantVersions) {
      const mbaNumber = String(version.mba_number ?? "")
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

      const lines = extractPublisherBillableMediaFromBillingSchedule(billingSchedule, year, month)
      if (lines.length === 0) continue

      const clientName = version.mp_client_name || version.campaign_name || "Unknown"
      const campaignName = version.campaign_name || "Unknown Campaign"

      const status = String(version.campaign_status || "")
        .toLowerCase()
        .trim()
      const bucket =
        status === "booked" || status === "approved"
          ? contributionsBooked
          : contributionsOther

      for (const line of lines) {
        bucket.push({
          publisherName: line.publisherName,
          clientName,
          mbaNumber,
          campaignName,
          amount: line.amount,
        })
      }
    }

    const bookedApproved = aggregatePublisherInvoiceContributions(contributionsBooked)
    const other = aggregatePublisherInvoiceContributions(contributionsOther)

    const meta = {
      selectedMonth: monthParam,
      totalVersions: allVersions.length,
      relevantVersions: relevantVersions.length,
      notice:
        bookedApproved.grandTotal === 0 && other.grandTotal === 0
          ? "No publisher invoice media for this month (check billing schedule and client-pays exclusions)."
          : undefined,
    }

    return NextResponse.json({
      bookedApproved,
      other,
      meta,
    })
  } catch (error: any) {
    console.error("Error fetching publisher finance data:", error)
    return NextResponse.json(
      { error: "Failed to fetch publisher finance data", details: error.message },
      { status: 500 }
    )
  }
}
