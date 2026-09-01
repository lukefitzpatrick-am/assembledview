import { NextRequest, NextResponse } from "next/server"
import {
  FinanceBillingWriteError,
  createFinanceBillingLineItem,
} from "@/lib/data/writeFinance"
import { requireFinanceAdmin } from "@/lib/requireRole"

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response

  try {
    const body = (await request.json()) as Record<string, unknown>
    const payload = await createFinanceBillingLineItem(body)
    return NextResponse.json(payload, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof FinanceBillingWriteError) {
      const status =
        error.code === "NOT_FOUND" ? 404 : error.code === "XERO_KEY_REFUSED" ? 409 : 400
      return NextResponse.json({ error: error.code, details: error.message }, { status })
    }
    return NextResponse.json(
      {
        error: "Failed to create line item",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
