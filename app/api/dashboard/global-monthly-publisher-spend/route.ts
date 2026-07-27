import { NextRequest, NextResponse } from "next/server"
import { getCachedGlobalMonthlyPublisherSpend } from "@/lib/api/dashboard/globalSpendCache"
import { requireRole } from "@/lib/requireRole"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    // AuthZ: book-wide spend is staff-only (admin|manager); client role must not see the whole book.
    const gate = await requireRole(request, ["admin", "manager"])
    if ("response" in gate) return gate.response

    // Auth outside unstable_cache (requireRole above).
    const result = await getCachedGlobalMonthlyPublisherSpend()
    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to fetch global monthly publisher spend:", error)
    return NextResponse.json(
      { error: "Failed to fetch global monthly publisher spend" },
      { status: 500 }
    )
  }
}
