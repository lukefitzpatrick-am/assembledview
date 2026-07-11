import { NextRequest, NextResponse } from "next/server"
import { getFinanceHubScheduleFytdTotals } from "@/lib/api/dashboard"
import { requireFinanceAdmin } from "@/lib/requireRole"

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response

  try {
    const fyRaw = request.nextUrl.searchParams.get("fy") ?? request.nextUrl.searchParams.get("financial_year")
    let financialYearStartYear: number | undefined
    if (fyRaw != null && fyRaw.trim() !== "") {
      const parsed = Number.parseInt(fyRaw, 10)
      if (!Number.isFinite(parsed) || parsed < 2000 || parsed > 2100) {
        return NextResponse.json(
          {
            error: "Invalid fy",
            message: "Query parameter fy must be a financial year start year (e.g. fy=2026).",
          },
          { status: 400 }
        )
      }
      financialYearStartYear = parsed
    }

    const result = await getFinanceHubScheduleFytdTotals(
      financialYearStartYear != null ? { financialYearStartYear } : {}
    )
    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to fetch finance hub schedule FYTD totals:", error)
    return NextResponse.json(
      { error: "Failed to fetch schedule FYTD totals" },
      { status: 500 }
    )
  }
}
