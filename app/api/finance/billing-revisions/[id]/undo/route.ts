import { NextResponse, type NextRequest } from "next/server"

import { previewUndo } from "@/lib/finance/revisions/revisionService"
import { gateBillingRevisionRoute, readJson } from "@/lib/finance/revisions/routeGate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST { reason? }: a restore preview for one revision. It never writes.
 * Apply it with /api/finance/billing-revisions/apply like any preview.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const gate = await gateBillingRevisionRoute(request)
  if ("response" in gate) return gate.response
  const { id } = await context.params
  const revisionId = Number(id)
  if (!Number.isInteger(revisionId) || revisionId <= 0) {
    return NextResponse.json({ error: "bad_request", message: "Bad revision id." }, { status: 400 })
  }
  try {
    const body = (await readJson(request)) as { reason?: unknown } | null
    const out = await previewUndo({
      revisionId,
      sub: gate.sub,
      source: "ui",
      reason: typeof body?.reason === "string" ? body.reason : undefined,
    })
    if (!out.ok) return NextResponse.json(out, { status: out.status })
    return NextResponse.json(out)
  } catch (error) {
    console.error("POST /api/finance/billing-revisions/[id]/undo", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
