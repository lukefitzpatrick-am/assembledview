import { NextRequest, NextResponse } from "next/server"
import { requireFinanceAdmin } from "@/lib/requireRole"

export const maxDuration = 60

/**
 * Mark-as-sent is retired. Send to accounts is the only exported_at writer.
 * Route stays so leftover callers get 410, not 404.
 */
export async function POST(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response
  return NextResponse.json(
    {
      error: "gone",
      message: "Mark as sent is retired. Use Send to accounts on the invoicing month bar.",
    },
    { status: 410 }
  )
}
