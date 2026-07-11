import "server-only"

import { computeAudienceResponse } from "@/lib/planning/compute"
import { getCachedPlanningMeta } from "@/lib/planning/metaCache"
import { getAudienceProfile } from "@/lib/planning/queries"
import {
  PLANNING_AGE_BANDS,
  PLANNING_GENDERS,
  PLANNING_STATES,
  type PlanningAgeBand,
  type PlanningGender,
  type PlanningState,
  type ReachBasis,
} from "@/lib/planning/types"
import type {
  ClientSafePlannedAudience,
  ClientSafeReachIndexPoint,
  PlanningAudienceRow,
} from "./audienceTypes"
import {
  buildDefinitionLine,
  CLIENT_SAFE_FORBIDDEN_KEYS,
} from "./clientSafeAudienceShared"

export { buildDefinitionLine, CLIENT_SAFE_FORBIDDEN_KEYS } from "./clientSafeAudienceShared"

const STATE_SET = new Set<string>(PLANNING_STATES)
const AGE_SET = new Set<string>(PLANNING_AGE_BANDS)
const GENDER_SET = new Set<string>(PLANNING_GENDERS)

type SavedAudienceShape = {
  audience?: {
    name?: string
    segmentId?: string
    states?: string[]
    gender?: string
    ageBands?: string[]
    reachBasis?: string
  }
  wave_id?: string
}

function asSaved(raw: unknown): SavedAudienceShape {
  if (!raw || typeof raw !== "object") return {}
  return raw as SavedAudienceShape
}

function formatCreatedAt(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value
    return new Date(ms).toISOString()
  }
  const s = String(value).trim()
  return s || null
}

function genderLabel(gender: string | undefined): string {
  if (!gender || gender === "all") return "all genders"
  if (gender === "female") return "female"
  if (gender === "male") return "male"
  return "all genders"
}

async function buildReachIndex(
  draft: NonNullable<SavedAudienceShape["audience"]>,
  waveId: string
): Promise<ClientSafeReachIndexPoint[]> {
  const segmentId = String(draft.segmentId ?? "").trim()
  if (!waveId || !segmentId) return []

  const statesRaw = Array.isArray(draft.states) ? draft.states.map(String) : []
  const states = statesRaw.filter((s) => STATE_SET.has(s)) as PlanningState[]
  if (states.length === 0) return []

  const ageRaw = Array.isArray(draft.ageBands) ? draft.ageBands.map(String) : []
  const age_bands = ageRaw.filter((a) => AGE_SET.has(a)) as PlanningAgeBand[]

  const gender = String(draft.gender ?? "all")
  const genders: PlanningGender[] =
    gender === "female" || gender === "male"
      ? GENDER_SET.has(gender)
        ? [gender as PlanningGender]
        : []
      : []

  const reach_basis: ReachBasis =
    draft.reachBasis === "total" ? "total" : "addressable"

  try {
    const [meta, aggregates] = await Promise.all([
      getCachedPlanningMeta(),
      getAudienceProfile({
        wave_id: waveId,
        segment_id: segmentId,
        states,
        genders,
        age_bands,
        reach_basis,
      }),
    ])
    const computed = computeAudienceResponse({
      wave_id: waveId,
      segment_id: segmentId,
      reach_basis,
      aggregates,
      channels: meta.channels,
    })

    const points: ClientSafeReachIndexPoint[] = []
    for (const ch of computed.channels) {
      if (!ch.is_rm_measured) continue
      const metaRow = meta.channels.find((c) => c.channel_id === ch.channel_id)
      const label =
        metaRow?.level2 || metaRow?.level1 || ch.engine_channel_id || ch.channel_id
      const aff = ch.affinity_by_segment[segmentId]
      points.push({
        channel: label,
        reach_pct: Math.round(ch.reach_pct * 1000) / 10,
        affinity_index:
          typeof aff === "number" && Number.isFinite(aff) ? Math.round(aff) : 100,
      })
    }
    return points.toSorted((a, b) => b.reach_pct - a.reach_pct)
  } catch (err) {
    console.warn("[planning/clientSafeAudience] reach_index unavailable:", err)
    return []
  }
}

/**
 * Whitelist-shape a planning_audiences row for client (and staff preview) surfaces.
 * Never includes definition_json, budget, benches, or engine params.
 */
export async function toClientSafePlannedAudience(
  row: PlanningAudienceRow
): Promise<ClientSafePlannedAudience> {
  const saved = asSaved(row.definition_json)
  const draft = saved.audience ?? {}
  const waveId = typeof saved.wave_id === "string" ? saved.wave_id.trim() : ""

  let segmentName = String(draft.segmentId ?? "").trim() || "Audience"
  let waveLabel = waveId ? `Roy Morgan, ${waveId}` : "Roy Morgan"

  try {
    const meta = await getCachedPlanningMeta()
    const seg = meta.segments.find((s) => s.segment_id === draft.segmentId)
    if (seg?.name) segmentName = seg.name
    const wave = meta.waves.find((w) => w.wave_id === waveId)
    if (wave?.label) waveLabel = `Roy Morgan, ${wave.label}`
  } catch {
    // meta optional for summary text
  }

  const states = Array.isArray(draft.states) ? draft.states.map(String) : []
  const age_bands = Array.isArray(draft.ageBands) ? draft.ageBands.map(String) : []
  const gender = String(draft.gender ?? "all")
  const reach_basis = draft.reachBasis === "total" ? "total" : "addressable"

  const reach_index = await buildReachIndex(draft, waveId)

  return {
    id: Number(row.id),
    name: String(row.name ?? draft.name ?? "Audience"),
    composed_wc: Number(row.composed_wc) || 0,
    client_visible: Boolean(row.client_visible),
    created_at: formatCreatedAt(row.created_at),
    wave_label: waveLabel,
    definition_summary: {
      segment_name: segmentName,
      states,
      age_bands,
      gender: genderLabel(gender),
      reach_basis,
    },
    definition_line: buildDefinitionLine({
      segmentName,
      states,
      ageBands: age_bands,
      gender,
    }),
    reach_index,
  }
}
