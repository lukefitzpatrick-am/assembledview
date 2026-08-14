import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/requireRole"
import { recordIngestRun } from "@/lib/mediaplans/ingest/ingestRuns"
import { resolveCatalogueIdForProfileName } from "@/lib/mediaplans/ingest/publisherCatalogueJoin"

export const runtime = "nodejs"

/** Cancel review — writes ingest_runs, never savePlanVersion. */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth) {
    return auth.response
  }

  try {
    const body = (await request.json()) as {
      publisherName?: string | null
      publisherId?: number | null
      fileName?: string | null
      detectedConfidence?: number | null
      requiredCoverage?: number | null
      lineItemCount?: number
      panelCount?: number
      burstCount?: number
      moneyDelta?: number | null
    }
    const uploadedBy =
      typeof auth.session?.user?.email === "string"
        ? auth.session.user.email.trim().toLowerCase()
        : null
    const publisherName = body.publisherName?.trim() || null
    await recordIngestRun({
      publisherId:
        body.publisherId ??
        (publisherName ? resolveCatalogueIdForProfileName(publisherName) : null),
      publisherName,
      fileName: body.fileName ?? null,
      uploadedBy,
      detectedConfidence: body.detectedConfidence ?? null,
      requiredCoverage: body.requiredCoverage ?? null,
      lineItemCount: body.lineItemCount ?? 0,
      panelCount: body.panelCount ?? 0,
      burstCount: body.burstCount ?? 0,
      moneyDelta: body.moneyDelta ?? null,
      outcome: "cancelled",
      outcomeReason: "human cancel",
      acceptedVersionId: null,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[admin/ingest/cancel]", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Cancel failed" },
      { status: 500 },
    )
  }
}
