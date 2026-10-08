import { NextRequest, NextResponse } from "next/server"

import { requireAdmin } from "@/lib/requireRole"
import { enqueueAdminReportRuns } from "@/lib/reports/adminReportRunsStore"
import { periodFromYearMonth } from "@/lib/reports/selectMonthlyReportMbas"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Inserts missing report_runs for the chosen month. It does not generate
 * decks. The worker does that on the Sydney 4th and 5th.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth && auth.response) {
    return auth.response
  }

  const body = await request.json().catch(() => null)
  const raw =
    body && typeof body === "object" && "period" in body
      ? String((body as { period?: unknown }).period ?? "")
      : ""
  const period = periodFromYearMonth(raw)
  if (!period) {
    return NextResponse.json({ error: "Period must be YYYY-MM" }, { status: 400 })
  }

  try {
    const result = await enqueueAdminReportRuns(period)
    return NextResponse.json(result)
  } catch (error) {
    console.error("[admin/reports/enqueue]", error)
    return NextResponse.json(
      { error: "Could not queue reports. Migration 0095 may not be applied." },
      { status: 500 },
    )
  }
}
