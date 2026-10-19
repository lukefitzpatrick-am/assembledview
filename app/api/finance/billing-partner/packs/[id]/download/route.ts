import { NextRequest, NextResponse } from "next/server"
import { BlobNotFoundError } from "@vercel/blob"

import { getPrivateBlob } from "@/lib/creative/getPrivateBlob"
import { BillingPartnerPackError } from "@/lib/finance/billingPartner/errors"
import { readPackDownload } from "@/lib/finance/billingPartner/packStore"
import { requireFinanceAdmin } from "@/lib/requireRole"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PACK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response

  try {
    const { id } = await context.params
    if (!PACK_ID.test(id)) {
      throw new BillingPartnerPackError("Pack id is not valid", 400)
    }
    const pack = await readPackDownload(id)
    if (!pack) {
      return NextResponse.json({ error: "Pack file was not found" }, { status: 404 })
    }
    const blobResult = await getPrivateBlob(pack.pathname)
    if (!blobResult || blobResult.statusCode !== 200 || !blobResult.stream) {
      return NextResponse.json({ error: "Pack file was not found" }, { status: 404 })
    }
    const filename = filenameFromPathname(pack.pathname)
    return new NextResponse(blobResult.stream, {
      status: 200,
      headers: {
        "Content-Type": blobResult.blob.contentType || "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    if (error instanceof BlobNotFoundError) {
      return NextResponse.json({ error: "Pack file was not found" }, { status: 404 })
    }
    if (error instanceof BillingPartnerPackError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("GET /api/finance/billing-partner/packs/[id]/download", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

function filenameFromPathname(pathname: string): string {
  const base = pathname.split("/").pop()?.trim() || "AA pack.zip"
  return base.replace(/"/g, "")
}
