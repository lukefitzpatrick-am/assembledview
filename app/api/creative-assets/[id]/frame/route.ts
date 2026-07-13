import { NextRequest, NextResponse } from "next/server"
import { get } from "@vercel/blob"

import { getById, XanoCreativeAssetError } from "@/lib/creative/xanoCreativeAssets"
import { verifyFrameToken } from "@/lib/creative/liveMockup/frameSign"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function parseId(raw: string): number | null {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) return null
  return id
}

function isFrameMime(mime: string): boolean {
  return mime.startsWith("image/") || mime.startsWith("video/")
}

/**
 * GET /api/creative-assets/{id}/frame?exp=&sig=
 * Signed, time-boxed public frame URL for screenshot provider injection (no session).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idRaw } = await params
    const id = parseId(idRaw)
    if (!id) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 })
    }

    const expRaw = request.nextUrl.searchParams.get("exp")
    const sig = request.nextUrl.searchParams.get("sig") ?? ""
    const exp = Number(expRaw)
    if (!verifyFrameToken(id, exp, sig)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const row = await getById(id)
    if (!row || !isFrameMime(row.mime_type)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }

    const blobResult = await get(row.blob_url, { access: "private" })
    if (!blobResult || blobResult.statusCode !== 200 || !blobResult.stream) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }

    const contentType = row.mime_type || blobResult.blob.contentType || "application/octet-stream"

    return new NextResponse(blobResult.stream, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, no-store",
      },
    })
  } catch (error) {
    if (error instanceof XanoCreativeAssetError) {
      return NextResponse.json({ error: error.message }, { status: 502 })
    }
    console.error("GET /api/creative-assets/[id]/frame:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
