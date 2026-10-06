import { NextRequest, NextResponse } from "next/server"
import { BlobNotFoundError } from "@vercel/blob"

import { getPrivateBlob } from "@/lib/creative/getPrivateBlob"
import { isFinanceExportPath } from "@/lib/finance/sendToAccounts"
import { requireFinanceAdmin } from "@/lib/requireRole"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function escapeDispositionFilename(name: string): string {
  return name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

export async function GET(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response

  const pathParam = request.nextUrl.searchParams.get("path")?.trim() ?? ""
  if (!isFinanceExportPath(pathParam)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 })
  }

  try {
    const blobResult = await getPrivateBlob(pathParam)
    if (!blobResult || blobResult.statusCode !== 200 || !blobResult.stream) {
      return NextResponse.json({ error: "Blob not found" }, { status: 404 })
    }
    const filename = escapeDispositionFilename(pathParam.split("/").pop() || "billing-pack")
    const contentType =
      blobResult.blob.contentType ||
      (pathParam.endsWith("-csv") ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    return new NextResponse(blobResult.stream, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    if (error instanceof BlobNotFoundError) {
      return NextResponse.json({ error: "Blob not found" }, { status: 404 })
    }
    console.error("GET /api/finance/exports/download:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
