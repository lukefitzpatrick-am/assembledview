import { NextResponse, type NextRequest } from "next/server"

import { gateTrueUpRoute, readJsonBody, serviceErrorResponse } from "@/lib/finance/trueUp/routeGate"
import { readClientBillingTimings, setClientBillingTiming } from "@/lib/finance/trueUp/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET: clients.id -> billing timing (same month is absent). */
export async function GET(request: NextRequest) {
  const gate = await gateTrueUpRoute(request)
  if ("response" in gate) return gate.response
  try {
    return NextResponse.json({ timings: await readClientBillingTimings() })
  } catch (error) {
    console.error("GET /api/finance/true-up/billing-timing", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/** PUT { clientId, timing: same_month | month_ahead | in_arrears } */
export async function PUT(request: NextRequest) {
  const gate = await gateTrueUpRoute(request)
  if ("response" in gate) return gate.response
  try {
    const body = await readJsonBody(request)
    const out = await setClientBillingTiming({
      clientId: Number(body?.clientId),
      timing: String(body?.timing ?? ""),
      actor: gate.actor,
    })
    if (!out.ok) return serviceErrorResponse(out)
    return NextResponse.json(out)
  } catch (error) {
    console.error("PUT /api/finance/true-up/billing-timing", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
