import { NextRequest, NextResponse } from "next/server"

import { serveApInvoicePdf } from "@/lib/finance/invoices/invoicePdf"
import { requireFinanceAdmin } from "@/lib/requireRole"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ xeroInvoiceId: string }> },
): Promise<NextResponse> {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response

  try {
    const { xeroInvoiceId } = await context.params
    return await serveApInvoicePdf(request, xeroInvoiceId ?? "")
  } catch (error) {
    console.error("GET /api/finance/bills/[xeroInvoiceId]/pdf:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
