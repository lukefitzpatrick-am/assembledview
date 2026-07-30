import { NextRequest, NextResponse } from "next/server"
import {
  FINANCE_SAVED_VIEWS_PATH,
  xanoFinancePost,
} from "@/lib/finance/xanoFinanceApi"
import { readFinanceSavedViews } from "@/lib/data/readFinance"
import { requireFinanceAdmin } from "@/lib/requireRole"

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response

  try {
    const data = await readFinanceSavedViews()
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch saved views", details: error?.message || String(error) },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response

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
