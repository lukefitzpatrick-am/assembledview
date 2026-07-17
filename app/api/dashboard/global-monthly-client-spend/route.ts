import { NextRequest, NextResponse } from "next/server"
import { getCachedGlobalMonthlyClientSpend } from "@/lib/api/dashboard/globalSpendCache"
import { requireRole } from "@/lib/requireRole"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    // AuthZ: book-wide spend is staff-only (admin|manager); client role must not see the whole book.
    const gate = await requireRole(request, ["admin", "manager"])
    if ("response" in gate) return gate.response

    // Auth outside unstable_cache (requireRole above).
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
