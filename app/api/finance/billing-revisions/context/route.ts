import { NextResponse, type NextRequest } from "next/server"

import { loadPanelContext } from "@/lib/finance/revisions/revisionService"
import { gateBillingRevisionRoute } from "@/lib/finance/revisions/routeGate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET ?mba=&underspendMonth=: lines, months and locks for the panel. Read only. */
export async function GET(request: NextRequest) {
  const gate = await gateBillingRevisionRoute(request)
  if ("response" in gate) return gate.response
  const mba = request.nextUrl.searchParams.get("mba")?.trim() ?? ""
  if (!mba) return NextResponse.json({ error: "bad_request", message: "mba is required." }, { status: 400 })
  try {
    const out = await loadPanelContext({
      mbaNumber: mba,
      underspendMonth: request.nextUrl.searchParams.get("underspendMonth"),
    })
    if (!out.ok) return NextResponse.json(out, { status: out.status })
    return NextResponse.json(out)
  } catch (error) {
    console.error("GET /api/finance/billing-revisions/context", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
