import { NextRequest, NextResponse } from "next/server"

import { requireAdmin } from "@/lib/requireRole"
import { listAdminReportRuns, listOnDemandAdminRuns } from "@/lib/reports/adminReportRunsStore"
import { periodFromYearMonth } from "@/lib/reports/selectMonthlyReportMbas"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth && auth.response) {
    return auth.response
  }

  const period = periodFromYearMonth(request.nextUrl.searchParams.get("period") ?? "")
  if (!period) {
    return NextResponse.json({ error: "Period must be YYYY-MM" }, { status: 400 })
  }

  try {
    const [rows, onDemand] = await Promise.all([
      listAdminReportRuns(period.periodStart),
      listOnDemandAdminRuns(period),
    ])
    return NextResponse.json({ ...period, rows, onDemand })
  } catch (error) {
    console.error("[admin/reports]", error)
    return NextResponse.json(
      { error: "Reports are unavailable. Migration 0095 may not be applied." },
      { status: 500 },
    )
  }
}
