import { NextRequest, NextResponse } from "next/server"
import { FINANCE_BILLING_LINE_ITEMS_PATH, xanoFinancePost } from "@/lib/finance/xanoFinanceApi"

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>
    const payload = await xanoFinancePost(FINANCE_BILLING_LINE_ITEMS_PATH, body)
    return NextResponse.json(payload, { status: 201 })
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to create line item", details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
