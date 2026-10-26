import { NextResponse, type NextRequest } from "next/server"

import { parseRevisionParams } from "@/lib/finance/revisions/revisionParams"
import { currentRevisionMonth, previewRevision } from "@/lib/finance/revisions/revisionService"
import { gateBillingRevisionRoute, readJson } from "@/lib/finance/revisions/routeGate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST: preview a billing timing change on the published plan. Never writes. */
export async function POST(request: NextRequest) {
  const gate = await gateBillingRevisionRoute(request)
  if ("response" in gate) return gate.response
  try {
    const parsed = parseRevisionParams(await readJson(request), { currentMonth: currentRevisionMonth() })
    if (!parsed.ok) return NextResponse.json({ error: "bad_request", message: parsed.message }, { status: 400 })
    const out = await previewRevision({ ...parsed.value, source: "ui", sub: gate.sub })
    if (!out.ok) return NextResponse.json(out, { status: out.status })
    return NextResponse.json(out)
  } catch (error) {
    console.error("POST /api/finance/billing-revisions/preview", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
