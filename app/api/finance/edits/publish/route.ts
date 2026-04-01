import { NextRequest, NextResponse } from "next/server"
import { FINANCE_EDITS_PUBLISH_PATH, xanoFinancePost } from "@/lib/finance/xanoFinanceApi"

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>
    const payload = await xanoFinancePost(FINANCE_EDITS_PUBLISH_PATH, body)
    return NextResponse.json(payload)
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to publish finance edits", details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
