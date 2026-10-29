import { NextResponse, type NextRequest } from "next/server"

import { gateTrueUpRoute, serviceErrorResponse } from "@/lib/finance/trueUp/routeGate"
import { undoTrueUpNote } from "@/lib/finance/trueUp/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** DELETE: remove an explained, one-off or credit-note entry (status undone). */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await gateTrueUpRoute(request)
  if ("response" in gate) return gate.response
  try {
    const { id } = await params
    const actionId = Number(id)
    if (!Number.isInteger(actionId) || actionId <= 0) {
      return NextResponse.json({ error: "bad_request", message: "Bad id." }, { status: 400 })
    }
    const out = await undoTrueUpNote({ actionId, actor: gate.actor })
    if (!out.ok) return serviceErrorResponse(out)
    return NextResponse.json(out)
  } catch (error) {
    console.error("DELETE /api/finance/true-up/notes/[id]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
