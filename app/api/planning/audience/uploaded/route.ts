import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/requireRole"
import { getCachedPlanningMeta } from "@/lib/planning/metaCache"
import { buildUploadedAudienceResponse } from "@/lib/planning/upload/buildUploadedAudienceResponse"
import type { RmMappingResult } from "@/lib/planning/upload/mapRoyMorganToChannels"
import {
  getUploadedAudience,
  UploadedAudienceError,
} from "@/lib/planning/upload/uploadedAudienceRepo"
import type { ReachBasis } from "@/lib/planning/types"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function repoError(error: unknown): NextResponse {
  if (error instanceof UploadedAudienceError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  console.error("[api/planning/audience/uploaded]", error)
  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}

/**
 * POST /api/planning/audience/uploaded — drop-in for /api/planning/audience.
 * Rebuilds from the saved audience row's scalars. Parent parse_json is
 * provenance only and is not loaded on this path.
 */
export async function POST(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 })
  }
  const o = body as Record<string, unknown>

  const uploaded_audience_id =
    typeof o.uploaded_audience_id === "number"
      ? o.uploaded_audience_id
      : Number(o.uploaded_audience_id)
  if (!Number.isFinite(uploaded_audience_id) || uploaded_audience_id <= 0) {
    return NextResponse.json(
      { error: "uploaded_audience_id must be a positive number" },
      { status: 400 }
    )
  }

  const reach_basis = o.reach_basis
  if (reach_basis !== "addressable" && reach_basis !== "total") {
    return NextResponse.json(
      { error: 'reach_basis must be "addressable" or "total"' },
      { status: 400 }
    )
  }

  try {
    const row = await getUploadedAudience(uploaded_audience_id)
    const meta = await getCachedPlanningMeta()
    const byId = new Map(meta.channels.map((c) => [c.channel_id, c]))
    const mapping: RmMappingResult = {
      mapped: row.channels_json,
      unmatchedRows: [],
      uncoveredLeafIds: [],
      duplicateChannelIds: [],
      scoreableCount: row.channels_json.filter((m) => {
        const ch = byId.get(m.channelId)
        return ch?.engine_channel_id != null && ch.engine_channel_id !== ""
      }).length,
    }

    const response = buildUploadedAudienceResponse({
      mapping,
      channels: meta.channels,
      segmentKey: row.segment_key,
      waveCode: row.wave_code,
      reachBasis: reach_basis as ReachBasis,
      audienceWc: row.audience_wc ?? 0,
      unweightedN: row.unweighted_n ?? 0,
      universeWc: row.universe_wc ?? 0,
      suppressedCells: row.suppressed_cells ?? 0,
    })
    return NextResponse.json(response)
  } catch (error) {
    return repoError(error)
  }
}
