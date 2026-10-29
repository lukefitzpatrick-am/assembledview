import { NextResponse, type NextRequest } from "next/server"

import { TRUE_UP_COMPONENTS, type TrueUpComponent } from "@/lib/finance/trueUp/compute"
import { gateTrueUpRoute, readJsonBody, serviceErrorResponse } from "@/lib/finance/trueUp/routeGate"
import { previewTrueUpFix } from "@/lib/finance/trueUp/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * POST { mbaNumber, asOf, from?, components, strategy, noInvoiceMonths? }:
 * preview a true-up of one plan's billing schedule. Never writes.
 */
export async function POST(request: NextRequest) {
  const gate = await gateTrueUpRoute(request)
  if ("response" in gate) return gate.response
  try {
    const body = await readJsonBody(request)
    const components = Array.isArray(body?.components)
      ? (body!.components as unknown[]).map(String).filter((c): c is TrueUpComponent => TRUE_UP_COMPONENTS.includes(c as TrueUpComponent))
      : []
    const strategy = body?.strategy === "carry" ? "carry" : body?.strategy === "spread" ? "spread" : null
    if (!body || typeof body.mbaNumber !== "string" || typeof body.asOf !== "string" || !strategy) {
      return NextResponse.json(
        { error: "bad_request", message: "Send mbaNumber, asOf (YYYY-MM), components and strategy (spread or carry)." },
        { status: 400 },
      )
    }
    const out = await previewTrueUpFix({
      mbaNumber: body.mbaNumber,
      asOfMonth: body.asOf,
      fromMonth: typeof body.from === "string" ? body.from : undefined,
      choice: {
        components,
        strategy,
        noInvoiceMonths: Array.isArray(body.noInvoiceMonths) ? (body.noInvoiceMonths as unknown[]).map(String) : undefined,
      },
      sub: gate.sub,
    })
    if (!out.ok) return serviceErrorResponse(out)
    return NextResponse.json(out)
  } catch (error) {
    console.error("POST /api/finance/true-up/preview", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
