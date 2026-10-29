import { NextResponse, type NextRequest } from "next/server"

import { gateTrueUpRoute, readJsonBody, serviceErrorResponse } from "@/lib/finance/trueUp/routeGate"
import { previewTrueUpUndo } from "@/lib/finance/trueUp/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/** POST { actionId }: preview the undo of a schedule fix. Confirm through /apply. Never writes. */
export async function POST(request: NextRequest) {
  const gate = await gateTrueUpRoute(request)
  if ("response" in gate) return gate.response
  try {
    const body = await readJsonBody(request)
    const actionId = Number(body?.actionId)
    if (!Number.isInteger(actionId) || actionId <= 0) {
      return NextResponse.json({ error: "bad_request", message: "Send the actionId of the fix." }, { status: 400 })
    }
    const out = await previewTrueUpUndo({ actionId, sub: gate.sub })
    if (!out.ok) return serviceErrorResponse(out)
    return NextResponse.json(out)
  } catch (error) {
    console.error("POST /api/finance/true-up/undo", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
