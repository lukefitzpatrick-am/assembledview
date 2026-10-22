import { NextRequest, NextResponse } from "next/server"

import { buildPlanReconciliationWorkbook } from "@/lib/finance/exportPlanReconciliation"
import { loadPlanReconciliation } from "@/lib/finance/loadPlanReconciliation"
import {
  defaultReconciliationMonth,
  isBillingMonth,
  planReconciliationFilename,
} from "@/lib/finance/planReconciliation"
import { requireFinanceAdmin } from "@/lib/requireRole"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * FP-2a: GET /api/finance/reports/plan-reconciliation?month=YYYY-MM[&view=gaps|all][&format=xlsx]
 * Read only. Admin only. Finance figure vs billing-basis schedule_months, to the cent.
 */
export async function GET(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response

  const sp = request.nextUrl.searchParams
  const monthRaw = sp.get("month")
  if (monthRaw != null && !isBillingMonth(monthRaw)) {
    return NextResponse.json(
      { error: "invalid_month", message: "month must be YYYY-MM." },
      { status: 400 },
    )
  }
  const month = monthRaw ?? defaultReconciliationMonth()
  const view = sp.get("view") === "all" ? "all" : "gaps"

  try {
    const report = await loadPlanReconciliation(month)
    const rows = view === "all" ? report.rows : report.rows.filter((row) => row.status === "gap")
    if (sp.get("format") === "xlsx") {
      const buffer = await buildPlanReconciliationWorkbook(rows)
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${planReconciliationFilename(month)}"`,
        },
      })
    }
    return NextResponse.json({ ...report, view, rows })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not build the check."
    return NextResponse.json({ error: "report_failed", message }, { status: 500 })
  }
}
