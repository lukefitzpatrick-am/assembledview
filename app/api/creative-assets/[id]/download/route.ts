import { NextRequest, NextResponse } from "next/server"
import { get } from "@vercel/blob"
import { auth0 } from "@/lib/auth0"
import { checkClientMbaAccess } from "@/lib/auth/checkClientMbaAccess"
import { getUserRoles } from "@/lib/rbac"
import { getById, XanoCreativeAssetError } from "@/lib/creative/xanoCreativeAssets"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function escapeDispositionFilename(name: string): string {
  return name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

function parseId(raw: string): number | null {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) return null
  return id
}

function xanoErrorResponse(error: unknown): NextResponse {
  if (error instanceof XanoCreativeAssetError) {
    if (error.status === 401) {
      return NextResponse.json({ error: "Xano unauthorized" }, { status: 401 })
    }
    return NextResponse.json({ error: error.message }, { status: 502 })
  }
  console.error("GET /api/creative-assets/[id]/download:", error)
  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth0.getSession(request)
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorised" }, { status: 401 })
    }

    const { id: idRaw } = await params
    const id = parseId(idRaw)
    if (!id) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 })
    }

    const row = await getById(id)
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const roles = getUserRoles(session.user)
    if (roles.includes("client")) {
      const access = await checkClientMbaAccess(request, row.mba_number)
      if (!access.ok) return access.response
    }

    const blobResult = await get(row.blob_url, { access: "private" })
    if (!blobResult || blobResult.statusCode !== 200 || !blobResult.stream) {
      return NextResponse.json({ error: "Blob not found" }, { status: 404 })
    }

    const filename = escapeDispositionFilename(row.original_filename)
    const contentType = row.mime_type || blobResult.blob.contentType || "application/octet-stream"

    return new NextResponse(blobResult.stream, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    return xanoErrorResponse(error)
  }
}
