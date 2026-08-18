import { NextRequest, NextResponse } from "next/server"
import { generateMBA } from "@/lib/generateMBA"
import { requireRole } from "@/lib/requireRole"
import {
  buildMbaFromPersisted,
  PersistedDocError,
} from "@/lib/docs/buildMbaFromPersisted"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

/**
 * PC3 — MBA PDF from persisted schedule_months + approved_slice + fee snapshot.
 * Missing approved_slice is derived at read time (never written). Body:
 * { mba_number, version_number } ONLY (campaign_status may be posted and is ignored).
 * Admin/manager. Published version (`published_at`).
 */
export async function POST(req: NextRequest) {
  const gate = await requireRole(req, ["admin"])
  if ("response" in gate) return gate.response

  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const raw = body as Record<string, unknown>
    const allowed = new Set(["mba_number", "version_number", "mbanumber", "campaign_status"])
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

    const rendered = await buildMbaFromPersisted({ mbaNumber, versionNumber })
    const pdfBuffer = await generateMBA(rendered.mbaData)

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${rendered.filename}"`,
        "X-Snapshot-Checksum": rendered.checksumHex,
        "X-Snapshot-Footer": rendered.footer,
        "X-Slice-Source": rendered.sliceSource,
      },
    })
  } catch (error) {
    if (error instanceof PersistedDocError) {
      const status =
        error.code === "NOT_FOUND"
          ? 404
          : error.code === "BAD_REQUEST"
            ? 400
            : 422
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status }
      )
    }
    console.error("Error generating MBA PDF:", error)
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred"
    return NextResponse.json(
      { error: "Failed to generate PDF", details: errorMessage },
      { status: 500 }
    )
  }
}
