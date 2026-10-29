import { NextResponse, type NextRequest } from "next/server"

import { gateTrueUpRoute, serviceErrorResponse } from "@/lib/finance/trueUp/routeGate"
import { removeTrueUpInvoiceLink } from "@/lib/finance/trueUp/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** DELETE: remove a hand link. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await gateTrueUpRoute(request)
  if ("response" in gate) return gate.response
  try {
    const { id } = await params
    const linkId = Number(id)
    if (!Number.isInteger(linkId) || linkId <= 0) {
      return NextResponse.json({ error: "bad_request", message: "Bad id." }, { status: 400 })
    }
    const out = await removeTrueUpInvoiceLink({ id: linkId })
    if (!out.ok) return serviceErrorResponse(out)
    return NextResponse.json(out)
  } catch (error) {
    console.error("DELETE /api/finance/true-up/links/[id]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
