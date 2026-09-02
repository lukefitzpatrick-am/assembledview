import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/requireRole"
import { getCachedPlanningMeta } from "@/lib/planning/metaCache"
import { findRmBlock } from "@/lib/planning/upload/findRmBlock"
import {
  mapRoyMorganToChannels,
  type RmMappingOptions,
  type RmMappingOverrides,
} from "@/lib/planning/upload/mapRoyMorganToChannels"
import { countSuppressedMappedCells } from "@/lib/planning/upload/buildUploadedAudienceResponse"
import {
  getUpload,
  retainUploadThenCreateAudience,
  UploadedAudienceError,
} from "@/lib/planning/upload/uploadedAudienceRepo"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string }> }

function repoError(error: unknown): NextResponse {
  if (error instanceof UploadedAudienceError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  console.error("[api/planning/uploads/[id]/audiences]", error)
  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  return value.map((v) => String(v))
}

function parseOverrides(value: unknown): RmMappingOverrides | { error: string } {
  if (value == null) return {}
  if (typeof value !== "object" || Array.isArray(value)) {
    return { error: "overrides must be an object" }
  }
  const out: RmMappingOverrides = {}
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    const n = Number(key)
    if (!Number.isInteger(n)) {
      return { error: `overrides key "${key}" must be a row index` }
    }
    if (v !== null && typeof v !== "string") {
      return { error: `overrides[${key}] must be a string or null` }
    }
    out[n] = v
  }
  return out
}

function parseOptions(value: unknown): RmMappingOptions | { error: string } {
  if (value == null) {
    return { inheritRollupIds: [], benchmarkOnlyIds: [] }
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return { error: "options must be an object" }
  }
  const o = value as Record<string, unknown>
  const inheritRollupIds =
    o.inheritRollupIds == null ? [] : asStringArray(o.inheritRollupIds)
  const benchmarkOnlyIds =
    o.benchmarkOnlyIds == null ? [] : asStringArray(o.benchmarkOnlyIds)
  if (!inheritRollupIds || !benchmarkOnlyIds) {
    return { error: "options.inheritRollupIds and options.benchmarkOnlyIds must be arrays" }
  }
  return { inheritRollupIds, benchmarkOnlyIds }
}

/**
 * POST /api/planning/uploads/[id]/audiences — persist one mapped block as an uploaded audience.
 * Re-maps server-side from stored parse_json. Never trusts a client-sent channel list.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  const { id: idRaw } = await context.params
  const uploadId = Number(idRaw)
  if (!Number.isFinite(uploadId) || uploadId <= 0) {
    return NextResponse.json({ error: "id must be a positive number" }, { status: 400 })
  }

  const sessionEmail =
    typeof gate.session?.user?.email === "string"
      ? gate.session.user.email.trim()
      : ""
  if (!sessionEmail) {
    return NextResponse.json(
      { error: "created_by_email could not be resolved from session" },
      { status: 400 }
    )
  }

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

  const sheet_name = typeof o.sheet_name === "string" ? o.sheet_name.trim() : ""
  if (!sheet_name) {
    return NextResponse.json({ error: "sheet_name is required" }, { status: 400 })
  }
  const block_id = typeof o.block_id === "string" ? o.block_id.trim() : ""
  if (!block_id) {
    return NextResponse.json({ error: "block_id is required" }, { status: 400 })
  }
  const name = typeof o.name === "string" ? o.name.trim() : ""
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 })
  }

  let clients_id: number | null = null
  if (o.clients_id != null) {
    const n = typeof o.clients_id === "number" ? o.clients_id : Number(o.clients_id)
    if (!Number.isFinite(n) || n <= 0) {
      return NextResponse.json(
        { error: "clients_id must be a positive number or null" },
        { status: 400 }
      )
    }
    clients_id = n
  }

  if (o.definition == null || typeof o.definition !== "object" || Array.isArray(o.definition)) {
    return NextResponse.json({ error: "definition is required" }, { status: 400 })
  }

  const overrides = parseOverrides(o.overrides)
  if ("error" in overrides) {
    return NextResponse.json({ error: overrides.error }, { status: 400 })
  }
  const options = parseOptions(o.options)
  if ("error" in options) {
    return NextResponse.json({ error: options.error }, { status: 400 })
  }

  try {
    const upload = await getUpload(uploadId)
    const found = findRmBlock(upload.parse_json, sheet_name, block_id)
    if (!found) {
      return NextResponse.json(
        { error: "sheet_name / block_id not found in stored parse" },
        { status: 400 }
      )
    }

    const meta = await getCachedPlanningMeta()
    const mapping = mapRoyMorganToChannels({
      block: found.block,
      channels: meta.channels,
      overrides,
      options,
    })
    if (mapping.scoreableCount === 0) {
      return NextResponse.json(
        {
          error:
            "No scoreable channels after mapping. Adjust overrides or pick a different block.",
        },
        { status: 422 }
      )
    }

    const row = await retainUploadThenCreateAudience({
      uploadId,
      clientsId: clients_id,
      name,
      sheetName: sheet_name,
      blockId: block_id,
      waveCode: found.sheet.waveCode ?? upload.wave_code,
      filterLabel: found.block.filter ?? found.sheet.filter ?? upload.filter_label,
      audienceWc: found.block.popn000,
      unweightedN: found.block.unweightedN,
      universeWc: found.baseBlock?.popn000 ?? 0,
      suppressedCells: countSuppressedMappedCells(mapping, found.block),
      mappingJson: { overrides, options },
      channelsJson: mapping.mapped,
      definitionJson: o.definition,
      createdByEmail: sessionEmail,
    })
    return NextResponse.json(row, { status: 201 })
  } catch (error) {
    return repoError(error)
  }
}
