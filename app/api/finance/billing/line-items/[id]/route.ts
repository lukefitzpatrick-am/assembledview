import { NextRequest, NextResponse } from "next/server"
import {
  FinanceBillingWriteError,
  deleteFinanceBillingLineItemById,
  patchFinanceBillingLineItemById,
} from "@/lib/data/writeFinance"
import { requireFinanceAdmin } from "@/lib/requireRole"

export const maxDuration = 60

function writeErrorStatus(error: FinanceBillingWriteError): number {
  if (error.code === "NOT_FOUND") return 404
  if (error.code === "XERO_KEY_REFUSED") return 409
  return 400
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response

  try {
    const { id } = await context.params
    const body = (await request.json()) as Record<string, unknown>
    const payload = await patchFinanceBillingLineItemById(Number(id), body)
    return NextResponse.json(payload)
  } catch (error: unknown) {
    if (error instanceof FinanceBillingWriteError) {
      return NextResponse.json(
        { error: error.code, details: error.message },
        { status: writeErrorStatus(error) }
      )
    }
    return NextResponse.json(
      {
        error: "Failed to update line item",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response

  try {
    const { id } = await context.params
    await deleteFinanceBillingLineItemById(Number(id))
    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    if (error instanceof FinanceBillingWriteError) {
      return NextResponse.json(
        { error: error.code, details: error.message },
        { status: writeErrorStatus(error) }
      )
    }
    return NextResponse.json(
      {
        error: "Failed to delete line item",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
