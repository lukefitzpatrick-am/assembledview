import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/requireRole"
import { getCachedPlanningMeta } from "@/lib/planning/metaCache"
import { buildUploadedAudienceResponse } from "@/lib/planning/upload/buildUploadedAudienceResponse"
import { findRmBlock } from "@/lib/planning/upload/findRmBlock"
import type { RmMappingResult } from "@/lib/planning/upload/mapRoyMorganToChannels"
import {
  getUpload,
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
 * Returns a plain AudienceResponse. Provenance stays on the saved row / definition_json.
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
    const upload = await getUpload(row.upload_id)
    const found = findRmBlock(upload.parse_json, row.sheet_name, row.block_id)
    if (!found) {
      return NextResponse.json(
        { error: "Stored sheet/block is missing from parse_json" },
        { status: 422 }
      )
    }

    const meta = await getCachedPlanningMeta()
    const mapping: RmMappingResult = {
      mapped: row.channels_json,
      unmatchedRows: [],
      uncoveredLeafIds: [],
      duplicateChannelIds: [],
      scoreableCount: row.channels_json.length,
    }

    const response = buildUploadedAudienceResponse({
      mapping,
      block: found.block,
      baseBlock: found.baseBlock,
      channels: meta.channels,
      segmentKey: row.segment_key,
      waveCode: row.wave_code,
      reachBasis: reach_basis as ReachBasis,
    })
    return NextResponse.json(response)
  } catch (error) {
    return repoError(error)
  }
}
