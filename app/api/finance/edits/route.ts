import { NextRequest, NextResponse } from "next/server"
import {
  FINANCE_EDITS_PATH,
  parseList,
  xanoFinanceGet,
  xanoFinancePost,
} from "@/lib/finance/xanoFinanceApi"

export const maxDuration = 60

export async function GET(request: NextRequest) {
  try {
    const recordId = request.nextUrl.searchParams.get("finance_billing_records_id")
    const data = await xanoFinanceGet(FINANCE_EDITS_PATH)
    const rows = parseList(data)
    const filtered = recordId
      ? rows.filter((row: any) => String(row.finance_billing_records_id) === String(recordId))
      : rows
    return NextResponse.json(filtered)
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch finance edits", details: error?.message || String(error) },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>
    const payload = await xanoFinancePost(FINANCE_EDITS_PATH, body)
    return NextResponse.json(payload, { status: 201 })
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to create finance edit", details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
