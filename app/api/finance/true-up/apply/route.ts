import { NextResponse, type NextRequest } from "next/server"

import { gateTrueUpRoute, readJsonBody, serviceErrorResponse } from "@/lib/finance/trueUp/routeGate"
import { applyTrueUpFromToken } from "@/lib/finance/trueUp/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * POST { previewToken, confirm: true }: publish the true-up (or its undo) the
 * preview showed, and write the ledger in the same transaction.
 * 409 PREVIEW_STALE when Xero changed since the preview.
 */
export async function POST(request: NextRequest) {
  const gate = await gateTrueUpRoute(request)
  if ("response" in gate) return gate.response
  try {
    const body = await readJsonBody(request)
    if (!body || body.confirm !== true || typeof body.previewToken !== "string") {
      return NextResponse.json(
        { error: "bad_request", message: "Send the previewToken from a preview with confirm: true." },
        { status: 400 },
      )
    }
    const runId = Number(body.runId)
    const out = await applyTrueUpFromToken({
      token: body.previewToken,
      sub: gate.sub,
      actor: gate.actor,
      runId: Number.isInteger(runId) && runId > 0 ? runId : null,
    })
    if (!out.ok) return serviceErrorResponse(out)
    return NextResponse.json(out)
  } catch (error) {
    console.error("POST /api/finance/true-up/apply", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
