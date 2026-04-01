import { NextRequest, NextResponse } from "next/server"
import { FINANCE_BILLING_RECORDS_PATH, xanoFinancePatch } from "@/lib/finance/xanoFinanceApi"

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const body = (await request.json()) as Record<string, unknown>
    const payload = await xanoFinancePatch(`${FINANCE_BILLING_RECORDS_PATH}/${id}`, body)
    return NextResponse.json(payload)
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to update billing record", details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
