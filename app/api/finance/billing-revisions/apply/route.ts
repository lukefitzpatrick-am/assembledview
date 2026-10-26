import { NextResponse, type NextRequest } from "next/server"

import { applyRevisionFromToken } from "@/lib/finance/revisions/revisionService"
import { gateBillingRevisionRoute, readJson } from "@/lib/finance/revisions/routeGate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * POST { previewToken, confirm: true }: publish the billing revision the
 * preview showed. 409 PREVIEW_STALE / STALE_BASE_VERSION carry a fresh preview.
 */
export async function POST(request: NextRequest) {
  const gate = await gateBillingRevisionRoute(request)
  if ("response" in gate) return gate.response
  try {
    const body = (await readJson(request)) as { previewToken?: unknown; confirm?: unknown } | null
    if (!body || body.confirm !== true || typeof body.previewToken !== "string") {
      return NextResponse.json(
        { error: "bad_request", message: "Send the previewToken from a preview with confirm: true." },
        { status: 400 },
      )
    }
    const out = await applyRevisionFromToken({ token: body.previewToken, sub: gate.sub, actor: gate.actor })
    if (!out.ok) return NextResponse.json(out, { status: out.status })
    return NextResponse.json({ ok: true, ...out.result })
  } catch (error) {
    console.error("POST /api/finance/billing-revisions/apply", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
