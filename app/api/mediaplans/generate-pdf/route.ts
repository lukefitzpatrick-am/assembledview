import { NextRequest, NextResponse } from "next/server"
import { sql } from "drizzle-orm"

import { getDb, schema } from "@/db"
import { requireRole } from "@/lib/requireRole"
import {
  isVersionPublished,
  unpublishedDocumentError,
} from "@/lib/mediaplan/versionPublication"
import type { ApprovedSlice } from "@/lib/finance/approvedSlice"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

function normaliseMba(mba: string): string {
  return String(mba ?? "").trim().toLowerCase()
}

/**
 * PC3 — media plan Excel generation locked to admin/manager + persisted keys only.
 * Full line-item Excel rebuild from PG is not wired here (editor uses client-side
 * generateMediaPlan). This route rejects client totals and serves the stored
 * media_plan_file URL metadata when the version is published (`published_at`).
 */
export async function POST(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const raw = body as Record<string, unknown>
    const allowed = new Set(["mba_number", "version_number", "mbanumber"])
    const extra = Object.keys(raw).filter((k) => !allowed.has(k))
    if (extra.length > 0) {
      return NextResponse.json(
        {
          error: "Client-sent totals rejected — pass mba_number and version_number only",
          extra_keys: extra,
          code: "CLIENT_TOTALS_REJECTED",
        },
        { status: 400 }
      )
    }

    const mbaNumber = String(raw.mba_number ?? raw.mbanumber ?? "").trim()
    const versionNumber = Number(raw.version_number)
    if (!mbaNumber || !Number.isFinite(versionNumber) || versionNumber <= 0) {
      return NextResponse.json(
        { error: "mba_number and version_number are required" },
        { status: 400 }
      )
    }

    const db = getDb()
    const [version] = await db
      .select({
        id: schema.mediaPlanVersions.id,
        publishedAt: schema.mediaPlanVersions.publishedAt,
        approvedSlice: schema.mediaPlanVersions.approvedSlice,
        mediaPlanFile: schema.mediaPlanVersions.mediaPlanFile,
        snapshotChecksum: schema.mediaPlanVersions.snapshotChecksum,
      })
      .from(schema.mediaPlanVersions)
      .where(
        sql`lower(${schema.mediaPlanVersions.mbaNumber}) = ${normaliseMba(mbaNumber)} and ${schema.mediaPlanVersions.versionNumber} = ${versionNumber}`
      )
      .limit(1)

    if (!version) {
      return NextResponse.json({ error: "Version not found", code: "NOT_FOUND" }, { status: 404 })
    }
    if (!isVersionPublished(version)) {
      return NextResponse.json(
        {
          error: unpublishedDocumentError("render"),
          code: "NOT_APPROVED",
        },
        { status: 422 }
      )
    }
    const slice = version.approvedSlice as ApprovedSlice | null
    if (!slice || typeof slice !== "object") {
      return NextResponse.json(
        { error: "approved_slice missing", code: "MISSING_SLICE" },
        { status: 422 }
      )
    }

    // No live Excel rebuild from client payloads — return stored file metadata.
    return NextResponse.json(
      {
        ok: true,
        version_id: version.id,
        version_number: versionNumber,
        mba_number: mbaNumber,
        snapshot_checksum: version.snapshotChecksum,
        media_plan_file: version.mediaPlanFile,
        message:
          "Persisted media plan file metadata returned. Editor Excel uses client-side generateMediaPlan; this route no longer accepts client totals.",
      },
      { status: 200 }
    )
  } catch (error) {
    console.error("Failed to generate media plan Excel:", error)
    return NextResponse.json({ error: "Failed to generate media plan Excel" }, { status: 500 })
  }
}
