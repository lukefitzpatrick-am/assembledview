import { NextResponse, type NextRequest } from "next/server"

import { TRUE_UP_COMPONENTS, type TrueUpComponent } from "@/lib/finance/trueUp/compute"
import { gateTrueUpRoute, readJsonBody, serviceErrorResponse } from "@/lib/finance/trueUp/routeGate"
import { recordTrueUpNote } from "@/lib/finance/trueUp/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * POST { mbaNumber, component, action: explained | one_off | credit_note, asOf, from?, reasonCode?, note?, xeroInvoice? }
 * Records a ledger entry. No schedule change.
 */
export async function POST(request: NextRequest) {
  const gate = await gateTrueUpRoute(request)
  if ("response" in gate) return gate.response
  try {
    const body = await readJsonBody(request)
    const component = String(body?.component ?? "") as TrueUpComponent
    const action = String(body?.action ?? "")
    if (
      !body ||
      typeof body.mbaNumber !== "string" ||
      typeof body.asOf !== "string" ||
      !TRUE_UP_COMPONENTS.includes(component) ||
      !["explained", "one_off", "credit_note"].includes(action)
    ) {
      return NextResponse.json(
        { error: "bad_request", message: "Send mbaNumber, asOf, component and action (explained, one_off or credit_note)." },
        { status: 400 },
      )
    }
    const out = await recordTrueUpNote({
      input: {
        mbaNumber: body.mbaNumber,
        component,
        action: action as "explained" | "one_off" | "credit_note",
        asOfMonth: body.asOf,
        fromMonth: typeof body.from === "string" ? body.from : undefined,
        reasonCode: typeof body.reasonCode === "string" ? body.reasonCode : null,
        note: typeof body.note === "string" ? body.note : null,
        xeroInvoiceId: typeof body.xeroInvoice === "string" ? body.xeroInvoice : null,
      },
      actor: gate.actor,
    })
    if (!out.ok) return serviceErrorResponse(out)
    return NextResponse.json(out)
  } catch (error) {
    console.error("POST /api/finance/true-up/notes", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
