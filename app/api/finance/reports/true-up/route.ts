import { NextRequest, NextResponse } from "next/server"

import { financialYearStart, defaultTrueUpAsOf, isTrueUpMonth } from "@/lib/finance/trueUp/compute"
import { buildTrueUpCsv, trueUpCsvFilename } from "@/lib/finance/trueUp/csv"
import { isTrueUpEnabled } from "@/lib/finance/trueUp/flag"
import { loadTrueUp, todaySydneyIso } from "@/lib/finance/trueUp/load"
import { requireFinanceAdmin } from "@/lib/requireRole"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * True-up Stage 1: GET /api/finance/reports/true-up?asOf=YYYY-MM[&from=YYYY-MM][&format=csv]
 * Read only. Finance admins only. 404 while TRUE_UP is off.
 * Invoiced (Xero, sent and approved) against billing schedule_months on the
 * published version, by component and month, to the end of asOf.
 */
export async function GET(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response
  if (!isTrueUpEnabled()) {
    return NextResponse.json({ error: "not_found", message: "The true-up is switched off." }, { status: 404 })
  }

  const sp = request.nextUrl.searchParams
  const asOfRaw = sp.get("asOf")
  const fromRaw = sp.get("from")
  if ((asOfRaw != null && !isTrueUpMonth(asOfRaw)) || (fromRaw != null && !isTrueUpMonth(fromRaw))) {
    return NextResponse.json({ error: "invalid_month", message: "asOf and from must be YYYY-MM." }, { status: 400 })
  }
  const asOfMonth = asOfRaw ?? defaultTrueUpAsOf(todaySydneyIso())
  const fromMonth = fromRaw ?? financialYearStart(asOfMonth)
  if (fromMonth > asOfMonth) {
    return NextResponse.json({ error: "invalid_range", message: "from must be on or before asOf." }, { status: 400 })
  }

  try {
    const report = await loadTrueUp({ asOfMonth, fromMonth })
    if (sp.get("format") === "csv") {
      return new NextResponse(buildTrueUpCsv(report), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${trueUpCsvFilename(asOfMonth)}"`,
        },
      })
    }
    return NextResponse.json(report)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not build the true-up."
    return NextResponse.json({ error: "report_failed", message }, { status: 500 })
  }
}
