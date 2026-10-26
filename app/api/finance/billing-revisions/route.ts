import { NextResponse, type NextRequest } from "next/server"

import { listRevisions } from "@/lib/finance/revisions/revisionService"
import { gateBillingRevisionRoute } from "@/lib/finance/revisions/routeGate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET ?mba=: the billing change log for one plan, newest first. */
export async function GET(request: NextRequest) {
  const gate = await gateBillingRevisionRoute(request)
  if ("response" in gate) return gate.response
  const mba = request.nextUrl.searchParams.get("mba")?.trim() ?? ""
  if (!mba) return NextResponse.json({ error: "bad_request", message: "mba is required." }, { status: 400 })
  try {
    return NextResponse.json({ ok: true, revisions: await listRevisions(mba) })
  } catch (error) {
    console.error("GET /api/finance/billing-revisions", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
