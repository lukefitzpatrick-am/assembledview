import { NextRequest, NextResponse } from "next/server"
import { BlobNotFoundError } from "@vercel/blob"
import { auth0 } from "@/lib/auth0"
import { checkClientMbaAccess } from "@/lib/auth/checkClientMbaAccess"
import { getUserRoles } from "@/lib/rbac"
import { getPrivateBlob } from "@/lib/creative/getPrivateBlob"
import { parseReportExportPath } from "@/lib/reports/parseReportExportPath"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const PPTX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"

function escapeDispositionFilename(name: string): string {
  return name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

function filenameFromPathname(pathname: string): string {
  const base = pathname.split("/").pop()?.trim()
  return base && base.length > 0 ? base : "performance-report.pptx"
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth0.getSession(request)
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorised" }, { status: 401 })
    }

    const pathParam = request.nextUrl.searchParams.get("path")
    if (!pathParam) {
      return NextResponse.json({ error: "path is required" }, { status: 400 })
    }

    const parsed = parseReportExportPath(pathParam)
    if (!parsed) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 })
    }

    const roles = getUserRoles(session.user)
    if (roles.includes("client")) {
      const access = await checkClientMbaAccess(request, parsed.mba)
      if (!access.ok) return access.response
    }

    const blobResult = await getPrivateBlob(parsed.pathname)
    if (!blobResult || blobResult.statusCode !== 200 || !blobResult.stream) {
      return NextResponse.json({ error: "Blob not found" }, { status: 404 })
    }

    const filename = escapeDispositionFilename(filenameFromPathname(parsed.pathname))
    const contentType = blobResult.blob.contentType || PPTX_CONTENT_TYPE

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
    console.error("GET /api/reports/download:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
