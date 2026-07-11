/** Shared planning API DTOs (blueprint §8.3 + P7-2 extensions). */

export const PLANNING_STATES = [
  "NAT",
  "NSW",
  "VIC",
  "QLD",
  "SA",
  "WA",
  "TAS",
  "NT",
] as const

export type PlanningState = (typeof PLANNING_STATES)[number]

export const PLANNING_AGE_BANDS = [
  "14-24",
  "25-34",
  "35-49",
  "50-64",
  "65+",
] as const

export type PlanningAgeBand = (typeof PLANNING_AGE_BANDS)[number]

export const PLANNING_GENDERS = ["male", "female"] as const

export type PlanningGender = (typeof PLANNING_GENDERS)[number]

export type ReachBasis = "addressable" | "total"

export type PlanningBench = {
  attn: number | null
  brand_effect: number | null
  direct_effect: number | null
  cpm: number | null
}

export type PlanningWave = {
  wave_id: string
  label: string
  loaded_at: string | null
  source_files: string | null
}

export type PlanningSegment = {
  segment_id: string
  name: string
  is_intersection: boolean
  notes: string | null
}

export type PlanningChannelMeta = {
  channel_id: string
  level1: string | null
  level2: string | null
  sort_order: number
  is_rm_measured: boolean
  age_base: number
  engine_channel_id: string | null
  bench: PlanningBench
}

export type PlanningMeta = {
  waves: PlanningWave[]
  segments: PlanningSegment[]
  channels: PlanningChannelMeta[]
  states: readonly PlanningState[]
  age_bands: readonly PlanningAgeBand[]
  genders: readonly PlanningGender[]
}

export type AudienceRequest = {
  wave_id: string
  segment_id: string
  states: PlanningState[]
  genders: PlanningGender[]
  age_bands: PlanningAgeBand[]
  reach_basis: ReachBasis
}

/** Per-channel aggregates from PLANNING_FACT_REACH (one round-trip). */
export type AudienceAggregateRow = {
  channel_id: string
  /** Σ wc(basis) over selected cells (null cells excluded from sum). */
  selection_wc: number
  /** Count of selected cells where wc(basis) IS NULL. */
  selection_null_count: number
  /** Σ wc(basis) for segment=base, state=NAT, all genders/bands. */
  base_wc: number
}

export type AudienceChannelResult = {
  channel_id: string
  engine_channel_id: string
  reach_wc: number
  reach_pct: number
  affinity_by_segment: Record<string, number | null>
  age_fit: number
  gender_fit: number
  is_rm_measured: boolean
  age_base: number
  bench: PlanningBench
}

/** Locked §8.3 shape + reach_basis + per-channel age_base (+ channel_id/reach_wc for compose/smoke). */
export type AudienceResponse = {
  wave_id: string
  reach_basis: ReachBasis
  audience_wc: number
  suppressed_cells: number
  channels: AudienceChannelResult[]
}
