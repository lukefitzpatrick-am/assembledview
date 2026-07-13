import type {
  AudienceAggregateRow,
  AudienceChannelResult,
  AudienceResponse,
  PlanningBench,
  PlanningChannelMeta,
  ReachBasis,
} from "./types"

const POPULATION_CHANNEL_ID = "POPULATION"

export type ComputeAudienceInput = {
  wave_id: string
  segment_id: string
  reach_basis: ReachBasis
  aggregates: AudienceAggregateRow[]
  channels: PlanningChannelMeta[]
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** audience_wc = Σ POPULATION wc over selected cells. */
export function sumAudienceWc(aggregates: AudienceAggregateRow[]): number {
  const pop = aggregates.find((r) => r.channel_id === POPULATION_CHANNEL_ID)
  return pop ? toFiniteNumber(pop.selection_wc) : 0
}

/** unweighted_n = Σ UNWEIGHTED over selected POPULATION cells. */
export function sumUnweightedN(aggregates: AudienceAggregateRow[]): number {
  const pop = aggregates.find((r) => r.channel_id === POPULATION_CHANNEL_ID)
  return pop ? toFiniteNumber(pop.selection_unweighted) : 0
}

/** suppressed_cells = count of null wc(basis) among selected media-channel cells. */
export function countSuppressedCells(aggregates: AudienceAggregateRow[]): number {
  let n = 0
  for (const row of aggregates) {
    if (row.channel_id === POPULATION_CHANNEL_ID) continue
    n += Math.max(0, Math.floor(toFiniteNumber(row.selection_null_count)))
  }
  return n
}

export function reachPct(reachWc: number, audienceWc: number): number {
  if (!(audienceWc > 0)) return 0
  return reachWc / audienceWc
}

/**
 * affinity = (reach_pct in selection) ÷ (reach_pct in base/NAT/all-cells) × 100.
 * Null-safe: base reach 0 → null (never Infinity).
 */
export function affinityIndex(
  selectionReachPct: number,
  baseReachPct: number
): number | null {
  if (!(baseReachPct > 0)) return null
  if (!Number.isFinite(selectionReachPct)) return null
  return (selectionReachPct / baseReachPct) * 100
}

function emptyBench(): PlanningBench {
  return { attn: null, brand_effect: null, direct_effect: null, cpm: null }
}

/**
 * Assemble the locked audience response (blueprint §8.3 + reach_basis + age_base).
 * Compose on weighted counts only — never v_pct columns.
 */
export function computeAudienceResponse(input: ComputeAudienceInput): AudienceResponse {
  const { wave_id, segment_id, reach_basis, aggregates, channels } = input

  const audience_wc = sumAudienceWc(aggregates)
  const unweighted_n = sumUnweightedN(aggregates)
  const suppressed_cells = countSuppressedCells(aggregates)

  const pop = aggregates.find((r) => r.channel_id === POPULATION_CHANNEL_ID)
  const universe_wc = pop ? toFiniteNumber(pop.base_wc) : 0
  const baseAudienceWc = universe_wc
  const audienceWcAddressable = pop ? toFiniteNumber(pop.selection_wc_addressable) : 0
  const audienceWcTotal = pop ? toFiniteNumber(pop.selection_wc_total) : 0

  const channelById = new Map(channels.map((c) => [c.channel_id, c]))
  const aggById = new Map(aggregates.map((r) => [r.channel_id, r]))

  const resultChannels: AudienceChannelResult[] = []

  // Prefer dim order; fall back to aggregate keys for any unexpected fact-only rows.
  const orderedIds = [
    ...channels.map((c) => c.channel_id),
    ...aggregates.map((a) => a.channel_id),
  ]
  const seen = new Set<string>()

  for (const channelId of orderedIds) {
    if (channelId === POPULATION_CHANNEL_ID) continue
    if (seen.has(channelId)) continue
    seen.add(channelId)

    const meta = channelById.get(channelId)
    const agg = aggById.get(channelId)
    if (!agg && !meta) continue
    // Skip bench-only channels with no fact row in this wave (no reach to report).
    if (!agg) continue

    const reach_wc = toFiniteNumber(agg.selection_wc)
    const base_wc = toFiniteNumber(agg.base_wc)
    const selection_pct = reachPct(reach_wc, audience_wc)
    const base_pct = reachPct(base_wc, baseAudienceWc)
    const reach_pct_addressable = reachPct(
      toFiniteNumber(agg.selection_wc_addressable),
      audienceWcAddressable
    )
    const reach_pct_total = reachPct(
      toFiniteNumber(agg.selection_wc_total),
      audienceWcTotal
    )

    const is_rm_measured = meta?.is_rm_measured ?? true
    const affinity = is_rm_measured
      ? affinityIndex(selection_pct, base_pct)
      : 100

    const bench: PlanningBench = meta?.bench ?? emptyBench()

    resultChannels.push({
      channel_id: channelId,
      engine_channel_id: meta?.engine_channel_id ?? channelId,
      reach_wc,
      reach_pct: selection_pct,
      reach_pct_addressable,
      reach_pct_total,
      affinity_by_segment: { [segment_id]: affinity },
      // Phase 1: reach is already computed on the selected cells, so the prototype's
      // age/gender skew modifiers are redundant — multiply by 1 harmlessly.
      age_fit: 1.0,
      gender_fit: 1.0,
      is_rm_measured,
      age_base: meta?.age_base ?? 14,
      bench,
    })
  }

  return {
    wave_id,
    reach_basis,
    audience_wc,
    unweighted_n,
    universe_wc,
    suppressed_cells,
    channels: resultChannels,
  }
}
