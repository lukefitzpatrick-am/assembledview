import { NextResponse, type NextRequest } from "next/server"

import { gateTrueUpRoute, readJsonBody, serviceErrorResponse } from "@/lib/finance/trueUp/routeGate"
import { addTrueUpInvoiceLink, listTrueUpInvoiceLinks } from "@/lib/finance/trueUp/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET: the hand links from Xero invoices to MBAs. */
export async function GET(request: NextRequest) {
  const gate = await gateTrueUpRoute(request)
  if ("response" in gate) return gate.response
  try {
    return NextResponse.json({ links: await listTrueUpInvoiceLinks() })
  } catch (error) {
    console.error("GET /api/finance/true-up/links", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/** POST { invoice (number or Xero id), mbaNumber, billingMonth?, note? }: link an invoice to an MBA. */
export async function POST(request: NextRequest) {
  const gate = await gateTrueUpRoute(request)
  if ("response" in gate) return gate.response
  try {
    const body = await readJsonBody(request)
    if (!body || typeof body.invoice !== "string" || typeof body.mbaNumber !== "string") {
      return NextResponse.json({ error: "bad_request", message: "Send invoice and mbaNumber." }, { status: 400 })
    }
    const out = await addTrueUpInvoiceLink({
      invoice: body.invoice,
      mbaNumber: body.mbaNumber,
      billingMonth: typeof body.billingMonth === "string" && body.billingMonth ? body.billingMonth : null,
      note: typeof body.note === "string" ? body.note : null,
      actor: gate.actor,
    })
    if (!out.ok) return serviceErrorResponse(out)
    return NextResponse.json(out)
  } catch (error) {
    console.error("POST /api/finance/true-up/links", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
