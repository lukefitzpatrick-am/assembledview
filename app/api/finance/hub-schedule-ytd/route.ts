import { NextRequest, NextResponse } from "next/server"
import { getFinanceHubScheduleFytdTotals } from "@/lib/api/dashboard"
import { requireFinanceAdmin } from "@/lib/requireRole"

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response

  try {
    const result = await getFinanceHubScheduleFytdTotals()
    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to fetch finance hub schedule FYTD totals:", error)
    return NextResponse.json(
      { error: "Failed to fetch schedule FYTD totals" },
      { status: 500 }
    )
  }
}
