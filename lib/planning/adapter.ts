/**
 * Maps POST /api/planning/audience (+ meta) onto the BCS engine channel shape.
 * Compose law: wc only from the server — never re-derive reach from percentages client-side.
 */

import {
  PLANNING_CHANNEL_BENCH,
  SEARCH_ENGINE_CHANNEL_ID,
  type PlanningChannelBenchRow,
} from "./planningChannelBench"
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

/** Discriminator for Stage C taxonomy display vs BCS scoring. */
export type TaxonomyRowType = "leaf" | "rollup" | "injected"

/**
 * Full RM catalogue row for Stage C (+ injected Search).
 * POPULATION is never included — it remains universe base only.
 */
export type TaxonomyRow = {
  rowType: TaxonomyRowType
  channelId: string
  engineChannelId: string | null
  level1: string
  label: string
  sortOrder: number
  reachPct: number
  reachWc: number
  ageBase: number
  isRmMeasured: boolean
  /** Engine inputs for leaf / injected rows; null for display-only rollups. */
  engine: AdaptedChannel | null
}

export type AdapterResult = {
  /**
   * Full taxonomy for Stage C (leaves + rollups + Search).
   * Excludes POPULATION. Ordered by sort_order; Search appended last.
   */
  taxonomy: TaxonomyRow[]
  /**
   * Leaf channels with engine_channel_id + Search, ready for computeBcs.
   * Always `scoreableChannels(taxonomy)` — single filter site for scoring/DFII/allocate.
   */
  channels: AdaptedChannel[]
  /** Level-total + leaf RM rows for the legacy reach profile list. */
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

/** Leaves + injected Search only — BCS / DFII / allocate consumers. */
export function scoreableChannels(taxonomy: TaxonomyRow[]): AdaptedChannel[] {
  const out: AdaptedChannel[] = []
  for (const row of taxonomy) {
    if (row.rowType === "rollup") continue
    if (!row.engine) continue
    out.push(row.engine)
  }
  return out
}

function resolveBench(
  engineId: string,
  apiBench: AudienceChannelResult["bench"] | PlanningChannelMeta["bench"] | null | undefined,
  fallback: PlanningChannelBenchRow | undefined
): { attn: number; B: number; D: number; cpm: number; name: string; color: string } | null {
  const attn = apiBench?.attn ?? fallback?.attn.value ?? null
  const B = apiBench?.brand_effect ?? fallback?.brand_effect.value ?? null
  const D = apiBench?.direct_effect ?? fallback?.direct_effect.value ?? null
  const cpm = apiBench?.cpm ?? fallback?.cpm.value ?? null
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

function toReachProfileRow(row: TaxonomyRow): ReachProfileRow {
  return {
    channelId: row.channelId,
    level1: row.level1,
    label: row.label,
    reachPct: row.reachPct,
    reachWc: row.reachWc,
    ageBase: row.ageBase,
    isRmMeasured: row.isRmMeasured,
  }
}

/**
 * Build full taxonomy (leaves + rollups + Search), then scoreable subset for BCS.
 *
 * Leaf = meta.engine_channel_id is non-null (blueprint §8.2) → BCS mix.
 * Rollup = null engine_channel_id → Stage C display only (RM reach, not scored).
 * Search = client-side injected benchmark row (modelled — not RM measured).
 * POPULATION never enters taxonomy.
 */
export function adaptAudienceToEngine(opts: {
  audience: AudienceResponse
  meta: PlanningMeta
  segmentId: string
}): AdapterResult {
  const { audience, meta, segmentId } = opts
  const metaById = new Map(meta.channels.map((c) => [c.channel_id, c]))

  const taxonomy: TaxonomyRow[] = []
  const skippedEngineIds: string[] = []
  const seenEngineIds = new Set<string>()

  // Preserve dim sort order for taxonomy + scoreable leaves.
  const ordered = [...audience.channels].sort((a, b) => {
    const sa = metaById.get(a.channel_id)?.sort_order ?? 9999
    const sb = metaById.get(b.channel_id)?.sort_order ?? 9999
    return sa - sb
  })

  for (const row of ordered) {
    const metaRow = metaById.get(row.channel_id)
    const engineId = metaRow?.engine_channel_id?.trim() || null
    const isLeaf = engineId != null && engineId.length > 0
    const level1 = metaRow?.level1 ?? "Other"
    const label = displayLabel(metaRow, row.channel_id)
    const sortOrder = metaRow?.sort_order ?? 9999

    if (!isLeaf) {
      // Display-only group rollup (video_total, audio_total, …).
      taxonomy.push({
        rowType: "rollup",
        channelId: row.channel_id,
        engineChannelId: null,
        level1,
        label,
        sortOrder,
        reachPct: row.reach_pct,
        reachWc: row.reach_wc,
        ageBase: row.age_base,
        isRmMeasured: row.is_rm_measured,
        engine: null,
      })
      continue
    }

    if (engineId === SEARCH_ENGINE_CHANNEL_ID) continue
    if (seenEngineIds.has(engineId)) {
      // Duplicate engine mapping — keep RM row for profile/table; do not re-score.
      taxonomy.push({
        rowType: "leaf",
        channelId: row.channel_id,
        engineChannelId: engineId,
        level1,
        label,
        sortOrder,
        reachPct: row.reach_pct,
        reachWc: row.reach_wc,
        ageBase: row.age_base,
        isRmMeasured: row.is_rm_measured,
        engine: null,
      })
      continue
    }
    seenEngineIds.add(engineId)

    const resolved = resolveBench(
      engineId,
      row.bench ?? metaRow?.bench,
      PLANNING_CHANNEL_BENCH[engineId]
    )
    if (!resolved) {
      skippedEngineIds.push(engineId)
      // Still carry RM reach for Stage C / reachProfile; exclude from scoring.
      taxonomy.push({
        rowType: "leaf",
        channelId: row.channel_id,
        engineChannelId: engineId,
        level1,
        label,
        sortOrder,
        reachPct: row.reach_pct,
        reachWc: row.reach_wc,
        ageBase: row.age_base,
        isRmMeasured: row.is_rm_measured,
        engine: null,
      })
      continue
    }

    const engine: AdaptedChannel = {
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
    }

    taxonomy.push({
      rowType: "leaf",
      channelId: row.channel_id,
      engineChannelId: engineId,
      level1,
      label,
      sortOrder,
      reachPct: row.reach_pct,
      reachWc: row.reach_wc,
      ageBase: row.age_base,
      isRmMeasured: row.is_rm_measured,
      engine,
    })
  }

  // Search — benchmark-only constant (affinity 100 neutral). Own group for Stage C.
  const searchDefaults = PLANNING_CHANNEL_BENCH[SEARCH_ENGINE_CHANNEL_ID]
  if (searchDefaults) {
    const engine: AdaptedChannel = {
      id: SEARCH_ENGINE_CHANNEL_ID,
      name: searchDefaults.name,
      attn: searchDefaults.attn.value,
      B: searchDefaults.brand_effect.value,
      D: searchDefaults.direct_effect.value,
      cpm: searchDefaults.cpm.value,
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
    }
    taxonomy.push({
      rowType: "injected",
      channelId: SEARCH_ENGINE_CHANNEL_ID,
      engineChannelId: SEARCH_ENGINE_CHANNEL_ID,
      level1: "Search",
      label: searchDefaults.name,
      sortOrder: 10_000,
      reachPct: 0,
      reachWc: 0,
      ageBase: 14,
      isRmMeasured: false,
      engine,
    })
  }

  const channels = scoreableChannels(taxonomy)
  const reachProfile = taxonomy
    .filter((r) => r.isRmMeasured)
    .map(toReachProfileRow)

  return {
    taxonomy,
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
