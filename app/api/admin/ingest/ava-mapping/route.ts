import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/requireRole"
import { parseAvaMappingRequestBody } from "@/lib/mediaplans/ingest/avaColumnMapping"
import { runLiveAvaColumnMappingProposals } from "@/lib/mediaplans/ingest/avaColumnMapping.server"

export const runtime = "nodejs"

/**
 * AVA column-mapping suggestions for ingest (MR-11).
 * One batched call, only when a required template field is unmatched and
 * leftover headers exist. Suggestion-only — never auto-applies.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth && auth.response) {
    return auth.response
  }

  try {
    const parsed = parseAvaMappingRequestBody(await request.json())
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    const result = await runLiveAvaColumnMappingProposals({
      publisherName: parsed.publisherName,
      publisherConfidence: parsed.publisherConfidence,
      columns: parsed.columns,
      unmatchedRequired: parsed.unmatchedRequired,
      leftoverHeaders: parsed.leftoverHeaders,
    })
    return NextResponse.json({
      proposals: result.proposals,
      ava_call_count: result.ava_call_count,
    })
  } catch (e) {
    console.error("[admin/ingest/ava-mapping]", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AVA mapping failed" },
      { status: 500 },
    )
  }
}
