/**
 * Maps POST /api/planning/audience (+ meta) onto the BCS engine channel shape.
 * Compose law: wc only from the server — never re-derive reach from percentages client-side.
 */

import {
  BENCHMARK_DEFAULTS,
  SEARCH_ENGINE_CHANNEL_ID,
  type BenchmarkDefault,
} from "./benchmarkDefaults"
import type {
  AudienceChannelResult,
  AudienceResponse,
  PlanningChannelMeta,
  PlanningMeta,
} from "./types"

/** Engine-facing channel after adaptation (behavioural-planner Channel shape). */
export type AdaptedChannel = {
  id: string
  name: string
  attn: number
  B: number
  D: number
  cpm: number
  color: string
  /** Affinity index for the selected segment lens (100 = baseline). */
  aff: Record<string, number>
  ageMod: number
  genderMod: number
  /** Real RM reach fraction 0..1 (0 for benchmark-only Search). */
  reachPct: number
  reachWc: number
  /** Addressable reach fraction 0..1 (both bases always populated when RM-measured). */
  reachPctAddressable: number
  /** Total reach fraction 0..1. */
  reachPctTotal: number
  isRmMeasured: boolean
  ageBase: number
}

export type ReachProfileRow = {
  channelId: string
  level1: string
  label: string
  reachPct: number
  reachWc: number
  ageBase: number
  isRmMeasured: boolean
}

export type AdapterResult = {
  /** Leaf channels with engine_channel_id + Search, ready for computeBcs. */
  channels: AdaptedChannel[]
  /** Level-total rows (no engine_channel_id) for the reach profile list. */
  reachProfile: ReachProfileRow[]
  /** audience_wc in '000s → millions for MetricCards (÷ 1000). */
  audienceMillions: number
  audienceWc: number
  /** Σ UNWEIGHTED over selected POPULATION cells. */
  unweightedN: number
  /** base/NAT POPULATION wc — % of 14+ universe denominator. */
  universeWc: number
  suppressedCells: number
  /** Engine ids skipped because bench + defaults could not supply attn/B/D/cpm. */
  skippedEngineIds: string[]
}

function resolveBench(
  engineId: string,
  apiBench: AudienceChannelResult["bench"] | PlanningChannelMeta["bench"] | null | undefined,
  fallback: BenchmarkDefault | undefined
): { attn: number; B: number; D: number; cpm: number; name: string; color: string } | null {
  const attn = apiBench?.attn ?? fallback?.attn ?? null
  const B = apiBench?.brand_effect ?? fallback?.B ?? null
  const D = apiBench?.direct_effect ?? fallback?.D ?? null
  const cpm = apiBench?.cpm ?? fallback?.cpm ?? null
  if (attn == null || B == null || D == null || cpm == null) return null
  return {
    attn,
    B,
    D,
    cpm,
    name: fallback?.name ?? engineId,
    color: fallback?.color ?? "var(--channel-search)",
  }
}

function affinityForSegment(row: AudienceChannelResult, segmentId: string): number {
  const raw = row.affinity_by_segment[segmentId]
  if (typeof raw === "number" && Number.isFinite(raw)) return raw
  return 100
}

function displayLabel(meta: PlanningChannelMeta | undefined, channelId: string): string {
  if (meta?.level2) return meta.level2
  if (meta?.level1) return meta.level1
  return channelId
}

/**
 * Split audience channels into BCS leaves vs reach-profile rows,
 * merge Search as a client-side benchmark-only row, map benches → engine inputs.
 *
 * Leaf = meta.engine_channel_id is non-null (blueprint §8.2) → BCS mix.
 * Reach profile = all RM rows (level totals + leaves) so FTA wc is visible;
 * Search is mix-only (benchmark badge).
 */
export function adaptAudienceToEngine(opts: {
  audience: AudienceResponse
  meta: PlanningMeta
  segmentId: string
}): AdapterResult {
  const { audience, meta, segmentId } = opts
  const metaById = new Map(meta.channels.map((c) => [c.channel_id, c]))

  const channels: AdaptedChannel[] = []
  const reachProfile: ReachProfileRow[] = []
  const skippedEngineIds: string[] = []
  const seenEngineIds = new Set<string>()

  // Preserve dim sort order for the profile list.
  const ordered = [...audience.channels].sort((a, b) => {
    const sa = metaById.get(a.channel_id)?.sort_order ?? 9999
    const sb = metaById.get(b.channel_id)?.sort_order ?? 9999
    return sa - sb
  })

  for (const row of ordered) {
    const metaRow = metaById.get(row.channel_id)
    const engineId = metaRow?.engine_channel_id?.trim() || null
    const isLeaf = engineId != null && engineId.length > 0

    // Reach profile: every RM-measured row (totals + leaves). Skip pure bench rows.
    if (row.is_rm_measured) {
      reachProfile.push({
        channelId: row.channel_id,
        level1: metaRow?.level1 ?? "Other",
        label: displayLabel(metaRow, row.channel_id),
        reachPct: row.reach_pct,
        reachWc: row.reach_wc,
        ageBase: row.age_base,
        isRmMeasured: row.is_rm_measured,
      })
    }

    if (!isLeaf) continue
    if (engineId === SEARCH_ENGINE_CHANNEL_ID) continue
    if (seenEngineIds.has(engineId)) continue
    seenEngineIds.add(engineId)

    const resolved = resolveBench(
      engineId,
      row.bench ?? metaRow?.bench,
      BENCHMARK_DEFAULTS[engineId]
    )
    if (!resolved) {
      skippedEngineIds.push(engineId)
      continue
    }

    channels.push({
      id: engineId,
      name: resolved.name,
      attn: resolved.attn,
      B: resolved.B,
      D: resolved.D,
      cpm: resolved.cpm,
      color: resolved.color,
      aff: { [segmentId]: affinityForSegment(row, segmentId) },
      ageMod: row.age_fit,
      genderMod: row.gender_fit,
      reachPct: row.reach_pct,
      reachWc: row.reach_wc,
      reachPctAddressable: row.reach_pct_addressable,
      reachPctTotal: row.reach_pct_total,
      isRmMeasured: row.is_rm_measured,
      ageBase: row.age_base,
    })
  }

  // Search — benchmark-only constant (affinity 100 neutral).
  const searchDefaults = BENCHMARK_DEFAULTS[SEARCH_ENGINE_CHANNEL_ID]
  if (searchDefaults) {
    channels.push({
      id: SEARCH_ENGINE_CHANNEL_ID,
      name: searchDefaults.name,
      attn: searchDefaults.attn,
      B: searchDefaults.B,
      D: searchDefaults.D,
      cpm: searchDefaults.cpm,
      color: searchDefaults.color,
      aff: { [segmentId]: 100 },
      ageMod: 1,
      genderMod: 1,
      reachPct: 0,
      reachWc: 0,
      reachPctAddressable: 0,
      reachPctTotal: 0,
      isRmMeasured: false,
      ageBase: 14,
    })
  }

  return {
    channels,
    reachProfile,
    audienceMillions: audience.audience_wc / 1000,
    audienceWc: audience.audience_wc,
    unweightedN: audience.unweighted_n,
    universeWc: audience.universe_wc,
    suppressedCells: audience.suppressed_cells,
    skippedEngineIds,
  }
}
