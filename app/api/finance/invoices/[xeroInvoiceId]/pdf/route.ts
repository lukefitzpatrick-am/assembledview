import { NextRequest, NextResponse } from "next/server"

import { serveArInvoicePdf } from "@/lib/finance/invoices/invoicePdf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ xeroInvoiceId: string }> },
): Promise<NextResponse> {
  try {
    const { xeroInvoiceId } = await context.params
    return await serveArInvoicePdf(request, xeroInvoiceId ?? "")
  } catch (error) {
    console.error("GET /api/finance/invoices/[xeroInvoiceId]/pdf:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
