import { NextRequest, NextResponse } from "next/server"

import { getCachedPlannedToDate } from "@/lib/api/dashboard/globalSpendCache"
import { parsePlannedToDateFyParam } from "@/lib/api/dashboard/plannedToDate"
import { requireRole } from "@/lib/requireRole"

export const dynamic = "force-dynamic"

/**
 * Per-MBA planned spend to date on the client-hub delivery-schedule basis.
 * Book-wide; staff-only. Client role must not see other tenants' campaigns.
 */
export async function GET(request: NextRequest) {
  try {
    const gate = await requireRole(request, ["admin"])
    if ("response" in gate) return gate.response

    const fy = parsePlannedToDateFyParam(request.nextUrl.searchParams.get("fy"))
    if (fy == null) {
      return NextResponse.json(
        { error: "Invalid fy. Use an AU FY start year (2015–2100) or all." },
        { status: 400 },
      )
    }

    const byMba = await getCachedPlannedToDate(fy)
    return NextResponse.json({
      byMba,
      fy,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Failed to fetch planned-to-date:", error)
    return NextResponse.json(
      { error: "Failed to fetch planned-to-date" },
      { status: 500 },
    )
  }
}
