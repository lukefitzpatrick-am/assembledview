import { NextResponse } from "next/server"
import { getFinanceHubScheduleFytdTotals } from "@/lib/api/dashboard"

export async function GET() {
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
