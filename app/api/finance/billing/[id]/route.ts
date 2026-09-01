import { NextRequest, NextResponse } from "next/server"
import {
  FinanceBillingWriteError,
  patchFinanceBillingRecordById,
} from "@/lib/data/writeFinance"
import { requireFinanceAdmin } from "@/lib/requireRole"

export const maxDuration = 60

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response

  try {
    const { id } = await context.params
    const numericId = Number(id)
    const body = (await request.json()) as Record<string, unknown>
    const payload = await patchFinanceBillingRecordById(numericId, body)
    return NextResponse.json(payload)
  } catch (error: unknown) {
    if (error instanceof FinanceBillingWriteError) {
      const status =
        error.code === "NOT_FOUND" ? 404 : error.code === "XERO_KEY_REFUSED" ? 409 : 400
      return NextResponse.json({ error: error.code, details: error.message }, { status })
    }
    return NextResponse.json(
      {
        error: "Failed to update billing record",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
