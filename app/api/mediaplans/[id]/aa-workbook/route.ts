import { NextRequest, NextResponse } from "next/server"

import { checkClientMbaAccess } from "@/lib/auth/checkClientMbaAccess"
import { readVersionForDownload } from "@/lib/docs/readPublishedVersionDocuments"
import { renderPlanVersionDocuments } from "@/lib/docs/renderPlanVersionDocuments"
import {
  isVersionPublished,
  unpublishedDocumentError,
} from "@/lib/mediaplan/versionPublication"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

/**
 * Build the Advertising Associates workbook from a published version.
 * Persisted rows only. Writes nothing. Never reads the live form.
 */
export async function POST(
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
          error: unpublishedDocumentError("render"),
          code: "NOT_PUBLISHED",
        },
        { status: 422 },
      )
    }

    const rendered = await renderPlanVersionDocuments({
      mbaNumber: version.mbaNumber,
      versionNumber: version.versionNumber,
      kinds: ["aa_media_plan"],
      now: version.publishedAt ? new Date(version.publishedAt) : new Date(),
    })
    if (rendered.status === "not_published") {
      return NextResponse.json(
        {
          error: unpublishedDocumentError("render"),
          code: "NOT_PUBLISHED",
        },
        { status: 422 },
      )
    }

    const file = rendered.files.aa_media_plan
    const result = rendered.results.find((row) => row.kind === "aa_media_plan")
    if (!file || result?.status !== "written") {
      const message =
        result?.status === "not_applicable"
          ? "This published version has no Advertising Associates lines"
          : result?.error || "Could not build the Advertising Associates media plan"
      return NextResponse.json(
        { error: message, code: result?.status === "not_applicable" ? "NOT_APPLICABLE" : "RENDER_FAILED" },
        { status: result?.status === "error" ? 500 : 422 },
      )
    }

    return new NextResponse(new Uint8Array(file.buffer), {
      status: 200,
      headers: {
        "Content-Type": file.mime,
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "X-Document-State": "published",
      },
    })
  } catch (error) {
    console.error("[api/mediaplans/aa-workbook POST]", error)
    return NextResponse.json(
      { error: "Failed to build the Advertising Associates media plan" },
      { status: 500 },
    )
  }
}
