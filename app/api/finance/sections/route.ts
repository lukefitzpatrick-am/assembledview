import { NextRequest, NextResponse } from "next/server"
import { requireFinanceAdmin } from "@/lib/requireRole"

/**
 * Namespace stub for future `/api/finance/sections/*` endpoints.
 * Fail-closed admin gate; no handlers yet.
 */
export async function GET(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response
  return NextResponse.json(
    { error: "not_implemented", message: "Finance sections API has no endpoints yet." },
    { status: 404 }
  )
}

export async function POST(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response
  return NextResponse.json(
    { error: "not_implemented", message: "Finance sections API has no endpoints yet." },
    { status: 404 }
  )
}
