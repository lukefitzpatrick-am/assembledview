import { NextRequest, NextResponse } from "next/server"
import { requireFinanceAdmin } from "@/lib/requireRole"
import {
  fetchDraftMatchReport,
  normalizeDraftMatchQuery,
} from "@/lib/finance/sections/draftMatchQuery"
import {
  FinanceBillingWriteError,
  setFinanceBillingRecordXeroMatch,
} from "@/lib/data/writeFinance"

export const maxDuration = 60

function parseClientIds(raw: string | null): number[] {
  if (!raw?.trim()) return []
  const out: number[] = []
  for (const part of raw.split(",")) {
    const n = Number.parseInt(part.trim(), 10)
    if (Number.isFinite(n) && n > 0) out.push(n)
  }
  return [...new Set(out)]
}

export async function GET(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response

  try {
    const query = normalizeDraftMatchQuery({
      clients: parseClientIds(request.nextUrl.searchParams.get("clients")),
    })
    const payload = await fetchDraftMatchReport(query)
    return NextResponse.json(payload)
  } catch (error) {
    console.error("[finance/sections/draft-match]", error)
    return NextResponse.json({ error: "Failed to load draft match" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Invalid JSON body." }, { status: 400 })
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "bad_request", message: "Expected an object body." }, { status: 400 })
  }
  const raw = body as Record<string, unknown>
  const action = typeof raw.action === "string" ? raw.action : ""
  if (action !== "accept" && action !== "assign") {
    return NextResponse.json(
      { error: "bad_request", message: "action must be accept or assign." },
      { status: 400 }
    )
  }
  const invoiceKey = typeof raw.invoice_key === "string" ? raw.invoice_key.trim() : ""
  const xeroInvoiceId =
    typeof raw.xero_invoice_id === "string" ? raw.xero_invoice_id.trim() : ""
  if (!invoiceKey || !xeroInvoiceId) {
    return NextResponse.json(
      { error: "bad_request", message: "invoice_key and xero_invoice_id are required." },
      { status: 400 }
    )
  }

  try {
    const { record: row } = await setFinanceBillingRecordXeroMatch({
      invoiceKey,
      xeroInvoiceId,
      matchedBy: "manual",
    })
    return NextResponse.json({ ok: true, action, invoice_key: invoiceKey, xero_invoice_id: xeroInvoiceId, row })
  } catch (error) {
    if (error instanceof FinanceBillingWriteError) {
      const status = error.code === "NOT_FOUND" ? 404 : error.code === "XERO_KEY_REFUSED" ? 400 : 400
      return NextResponse.json({ error: error.code, message: error.message }, { status })
    }
    console.error("[finance/sections/draft-match] POST", error)
    return NextResponse.json({ error: "Failed to record match" }, { status: 500 })
  }
}
