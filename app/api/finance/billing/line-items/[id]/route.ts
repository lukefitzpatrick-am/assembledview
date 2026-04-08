import { NextRequest, NextResponse } from "next/server"
import {
  FINANCE_BILLING_LINE_ITEMS_PATH,
  xanoFinanceDelete,
  xanoFinancePatch,
} from "@/lib/finance/xanoFinanceApi"

export const maxDuration = 60

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const body = (await request.json()) as Record<string, unknown>
    const payload = await xanoFinancePatch(`${FINANCE_BILLING_LINE_ITEMS_PATH}/${id}`, body)
    return NextResponse.json(payload)
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to update line item", details: error?.message || String(error) },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    await xanoFinanceDelete(`${FINANCE_BILLING_LINE_ITEMS_PATH}/${id}`)
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to delete line item", details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
