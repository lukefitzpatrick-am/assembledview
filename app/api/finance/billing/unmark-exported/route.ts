import { NextRequest, NextResponse } from "next/server"
import { requireFinanceAdmin } from "@/lib/requireRole"

export const maxDuration = 60

/**
 * Unmark-exported is retired with mark-as-sent. Send to accounts stamps
 * exported_at; already-exported rows are skipped on the next send.
 */
export async function POST(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response
  return NextResponse.json(
    {
      error: "gone",
      message: "Un-mark is retired. Send to accounts does not clear an export stamp.",
    },
    { status: 410 }
  )
}
