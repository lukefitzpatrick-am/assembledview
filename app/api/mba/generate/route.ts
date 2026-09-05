import { NextRequest, NextResponse } from "next/server"
import { generateMBA } from "@/lib/generateMBA"
import { requireRole } from "@/lib/requireRole"
import {
  buildMbaFromPersisted,
  PersistedDocError,
} from "@/lib/docs/buildMbaFromPersisted"
import { parseMbaGenerateBody } from "@/lib/docs/mbaGenerateBody"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

/**
 * PC3 — MBA PDF from persisted schedule_months + approved_slice + fee snapshot.
 * Missing approved_slice is derived at read time (never written). Body:
 * { mba_number, version_number } plus optional live selection keys
 * (selectedMonthYears, approvedLineItemIds) and optional liveCampaignDates.
 * Totals stay forbidden. Admin only. Published version (`published_at`).
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

    const parsed = parseMbaGenerateBody(body)
    if (!parsed.ok) {
      return NextResponse.json(parsed.payload, { status: parsed.status })
    }

    const rendered = await buildMbaFromPersisted({
      mbaNumber: parsed.mbaNumber,
      versionNumber: parsed.versionNumber,
      liveCampaignStatus: parsed.liveCampaignStatus,
      liveSelection: parsed.liveSelection,
      liveCampaignDates: parsed.liveCampaignDates,
    })
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
