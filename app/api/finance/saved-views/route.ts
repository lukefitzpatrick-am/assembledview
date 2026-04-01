import { NextRequest, NextResponse } from "next/server"
import {
  FINANCE_SAVED_VIEWS_PATH,
  parseList,
  xanoFinanceGet,
  xanoFinancePost,
} from "@/lib/finance/xanoFinanceApi"

export async function GET() {
  try {
    const data = await xanoFinanceGet(FINANCE_SAVED_VIEWS_PATH)
    return NextResponse.json(parseList(data))
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch saved views", details: error?.message || String(error) },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>
    const payload = await xanoFinancePost(FINANCE_SAVED_VIEWS_PATH, body)
    return NextResponse.json(payload, { status: 201 })
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to save view", details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
