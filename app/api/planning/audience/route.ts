import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/requireRole"
import { computeAudienceResponse } from "@/lib/planning/compute"
import { getCachedPlanningMeta } from "@/lib/planning/metaCache"
import { getAudienceProfile } from "@/lib/planning/queries"
import {
  PLANNING_AGE_BANDS,
  PLANNING_GENDERS,
  PLANNING_STATES,
  type AudienceRequest,
  type PlanningAgeBand,
  type PlanningGender,
  type PlanningState,
  type ReachBasis,
} from "@/lib/planning/types"

export const dynamic = "force-dynamic"

const STATE_SET = new Set<string>(PLANNING_STATES)
const AGE_SET = new Set<string>(PLANNING_AGE_BANDS)
const GENDER_SET = new Set<string>(PLANNING_GENDERS)

function badRequest(reason: string) {
  return NextResponse.json({ error: reason }, { status: 400 })
}

function asStringArray(value: unknown): string[] {
  if (value == null) return []
  if (!Array.isArray(value)) return []
  return value.map((v) => String(v).trim()).filter(Boolean)
}

function parseBody(raw: unknown): { ok: true; body: AudienceRequest } | { ok: false; reason: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: "Body must be a JSON object" }
  }
  const o = raw as Record<string, unknown>

  const wave_id = typeof o.wave_id === "string" ? o.wave_id.trim() : ""
  const segment_id = typeof o.segment_id === "string" ? o.segment_id.trim() : ""
  if (!wave_id) return { ok: false, reason: "wave_id is required" }
  if (!segment_id) return { ok: false, reason: "segment_id is required" }

  const statesRaw = asStringArray(o.states)
  if (statesRaw.length === 0) {
    return { ok: false, reason: "states must be a non-empty array" }
  }
  for (const s of statesRaw) {
    if (!STATE_SET.has(s)) {
      return {
        ok: false,
        reason: `Invalid state "${s}"; allowed: ${PLANNING_STATES.join(", ")}`,
      }
    }
  }
  const hasNat = statesRaw.includes("NAT")
  if (hasNat && statesRaw.length > 1) {
    return {
      ok: false,
      reason: "NAT is exclusive and cannot be mixed with other states",
    }
  }
  const states = statesRaw as PlanningState[]

  const gendersRaw = asStringArray(o.genders)
  for (const g of gendersRaw) {
    if (!GENDER_SET.has(g)) {
      return {
        ok: false,
        reason: `Invalid gender "${g}"; allowed: ${PLANNING_GENDERS.join(", ")} (empty = both)`,
      }
    }
  }
  const genders = gendersRaw as PlanningGender[]

  const ageRaw = asStringArray(o.age_bands)
  for (const a of ageRaw) {
    if (!AGE_SET.has(a)) {
      return {
        ok: false,
        reason: `Invalid age_band "${a}"; allowed: ${PLANNING_AGE_BANDS.join(", ")} (empty = all)`,
      }
    }
  }
  const age_bands = ageRaw as PlanningAgeBand[]

  let reach_basis: ReachBasis = "addressable"
  if (o.reach_basis != null) {
    if (o.reach_basis !== "addressable" && o.reach_basis !== "total") {
      return {
        ok: false,
        reason: 'reach_basis must be "addressable" or "total"',
      }
    }
    reach_basis = o.reach_basis
  }

  return {
    ok: true,
    body: { wave_id, segment_id, states, genders, age_bands, reach_basis },
  }
}

/**
 * POST /api/planning/audience — compose reach/affinity on wc for a cell selection.
 * Gate: admin | manager. No response cache (fast aggregate).
 */
export async function POST(request: NextRequest) {
  const gate = await requireRole(request, ["admin", "manager"])
  if ("response" in gate) return gate.response

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return badRequest("Invalid JSON body")
  }

  const parsed = parseBody(raw)
  if (!parsed.ok) return badRequest(parsed.reason)

  try {
    const meta = await getCachedPlanningMeta()
    const waveOk = meta.waves.some((w) => w.wave_id === parsed.body.wave_id)
    if (!waveOk) {
      return badRequest(`Unknown wave_id "${parsed.body.wave_id}"`)
    }
    const segmentOk = meta.segments.some(
      (s) => s.segment_id === parsed.body.segment_id
    )
    if (!segmentOk) {
      return badRequest(`Unknown segment_id "${parsed.body.segment_id}"`)
    }

    const aggregates = await getAudienceProfile(parsed.body)
    const response = computeAudienceResponse({
      wave_id: parsed.body.wave_id,
      segment_id: parsed.body.segment_id,
      reach_basis: parsed.body.reach_basis,
      aggregates,
      channels: meta.channels,
    })
    return NextResponse.json(response)
  } catch (err) {
    console.error("[api/planning/audience]", err)
    return NextResponse.json(
      { error: "Failed to compose audience profile" },
      { status: 500 }
    )
  }
}
