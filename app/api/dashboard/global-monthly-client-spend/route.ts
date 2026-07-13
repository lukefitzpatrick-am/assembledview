import { NextResponse } from "next/server"
import { getCachedGlobalMonthlyClientSpend } from "@/lib/api/dashboard/globalSpendCache"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    // Auth is enforced by middleware; keep it outside unstable_cache.
    const result = await getCachedGlobalMonthlyClientSpend()
    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to fetch global monthly client spend:", error)
    return NextResponse.json(
      { error: "Failed to fetch global monthly client spend" },
      { status: 500 }
    )
  }
}
