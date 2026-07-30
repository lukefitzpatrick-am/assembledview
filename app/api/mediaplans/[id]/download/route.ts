import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"

import { getDb, schema } from "@/db"
import { requireRole } from "@/lib/requireRole"
import { isApprovedOrBeyond } from "@/lib/docs/isApprovedOrBeyond"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

/**
 * PC3 — download stored media-plan / MBA file for a version id.
 * Admin/manager only. Serves persisted file metadata / public URL when present.
 * No Xano proxy of unauthenticated downloads.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole(request, ["admin", "manager"])
  if ("response" in gate) return gate.response

  try {
    const { id } = await params
    const versionId = Number(id)
    if (!Number.isFinite(versionId) || versionId <= 0) {
      return NextResponse.json({ error: "Invalid version id" }, { status: 400 })
    }

    const db = getDb()
    const [version] = await db
      .select({
        id: schema.mediaPlanVersions.id,
        mbaNumber: schema.mediaPlanVersions.mbaNumber,
        versionNumber: schema.mediaPlanVersions.versionNumber,
        campaignStatus: schema.mediaPlanVersions.campaignStatus,
        mediaPlanFile: schema.mediaPlanVersions.mediaPlanFile,
        mbaPdfFile: schema.mediaPlanVersions.mbaPdfFile,
        snapshotChecksum: schema.mediaPlanVersions.snapshotChecksum,
      })
      .from(schema.mediaPlanVersions)
      .where(eq(schema.mediaPlanVersions.id, versionId))
      .limit(1)

    if (!version) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 })
    }
    if (!isApprovedOrBeyond(version.campaignStatus)) {
      return NextResponse.json(
        {
          error: `Document download requires approved-or-beyond status (got "${version.campaignStatus || "empty"}")`,
          code: "NOT_APPROVED",
        },
        { status: 422 }
      )
    }

    const kind = new URL(request.url).searchParams.get("kind") || "media_plan"
    const file =
      kind === "mba_pdf" ? version.mbaPdfFile : version.mediaPlanFile

    if (!file) {
      return NextResponse.json(
        {
          error: "No stored document for this version — regenerate after publish",
          code: "NO_STORED_FILE",
          version_id: version.id,
          mba_number: version.mbaNumber,
          version_number: version.versionNumber,
          snapshot_checksum: version.snapshotChecksum,
        },
        { status: 404 }
      )
    }

    // Prefer redirect to public path when present; otherwise return metadata.
    const path =
      file && typeof file === "object" && "path" in (file as object)
        ? String((file as { path?: string }).path ?? "")
        : ""
    if (path.startsWith("http://") || path.startsWith("https://")) {
      return NextResponse.redirect(path)
    }

    return NextResponse.json({
      ok: true,
      version_id: version.id,
      mba_number: version.mbaNumber,
      version_number: version.versionNumber,
      snapshot_checksum: version.snapshotChecksum,
      file,
    })
  } catch (error) {
    console.error("Error downloading media plan:", error)
    return NextResponse.json({ error: "Failed to download media plan" }, { status: 500 })
  }
}
