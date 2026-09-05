import { NextRequest, NextResponse } from "next/server"

import { checkClientMbaAccess } from "@/lib/auth/checkClientMbaAccess"
import {
  fileJsonForKind,
  parseDownloadKind,
  parsePlanFileJson,
} from "@/lib/docs/planVersionFiles"
import { readVersionForDownload } from "@/lib/docs/readPublishedVersionDocuments"
import { servePlanFileAttachment } from "@/lib/docs/servePlanFile"
import {
  isVersionPublished,
  unpublishedDocumentError,
} from "@/lib/mediaplan/versionPublication"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

/**
 * Download a stored media-plan / MBA / AA file for a version id.
 * Tenant: checkClientMbaAccess on the version's MBA (admin unscoped in the
 * helper). Client-role callers may download their own campaign files.
 * Missing url/path → 404 `{ code: "NOT_SAVED" }` — never generate on the fly.
 * Vercel Blob urls stream via getPrivateBlob; http(s) Xano vault urls stay a
 * fetch pass-through. Content-Disposition uses the stored `name`.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const versionId = Number(id)
    if (!Number.isFinite(versionId) || versionId <= 0) {
      return NextResponse.json({ error: "Invalid version id" }, { status: 400 })
    }

    const version = await readVersionForDownload(versionId)
    if (!version) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 })
    }

    const access = await checkClientMbaAccess(request, version.mbaNumber)
    if (!access.ok) return access.response

    if (!isVersionPublished(version)) {
      return NextResponse.json(
        {
          error: unpublishedDocumentError("download"),
          code: "NOT_APPROVED",
        },
        { status: 422 },
      )
    }

    const kind = parseDownloadKind(new URL(request.url).searchParams.get("kind"))
    const file = fileJsonForKind(kind, version)
    if (!parsePlanFileJson(file, version.publishedAt)) {
      return NextResponse.json(
        {
          error: "No stored document for this version",
          code: "NOT_SAVED",
        },
        { status: 404 },
      )
    }

    return servePlanFileAttachment(file)
  } catch (error) {
    console.error("Error downloading media plan:", error)
    return NextResponse.json({ error: "Failed to download media plan" }, { status: 500 })
  }
}
