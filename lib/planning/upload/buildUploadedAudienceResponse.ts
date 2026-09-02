import type {
  AudienceChannelResult,
  AudienceResponse,
  PlanningChannelMeta,
  ReachBasis,
} from "../types"
import type { RmMappingResult } from "./mapRoyMorganToChannels"
import type { RmBlock } from "./royMorganTypes"

type SharedArgs = {
  mapping: RmMappingResult
  channels: PlanningChannelMeta[]
  segmentKey: string
  waveCode: string | null
  reachBasis: ReachBasis
}

type BlockDerivedArgs = SharedArgs & {
  block: RmBlock
  baseBlock: RmBlock | null
}

type ScalarArgs = SharedArgs & {
  audienceWc: number
  unweightedN: number
  universeWc: number
  suppressedCells: number
}

export function countSuppressedMappedCells(
  mapping: RmMappingResult,
  block: RmBlock
): number {
  const sourceByRow = new Map(block.rows.map((r) => [r.rowIndex, r]))
  let suppressed_cells = 0
  for (const m of mapping.mapped) {
    if (m.sourceRowIndex == null) continue
    if (sourceByRow.get(m.sourceRowIndex)?.suppressed) suppressed_cells += 1
  }
  return suppressed_cells
}

function scalarsFromArgs(args: BlockDerivedArgs | ScalarArgs): {
  audience_wc: number
  unweighted_n: number
  universe_wc: number
  suppressed_cells: number
} {
  if ("block" in args) {
    return {
      audience_wc: args.block.popn000 ?? 0,
      unweighted_n: args.block.unweightedN ?? 0,
      universe_wc: args.baseBlock?.popn000 ?? 0,
      suppressed_cells: countSuppressedMappedCells(args.mapping, args.block),
    }
  }
  return {
    audience_wc: args.audienceWc,
    unweighted_n: args.unweightedN,
    universe_wc: args.universeWc,
    suppressed_cells: args.suppressedCells,
  }
}

export function buildUploadedAudienceResponse(
  args: BlockDerivedArgs | ScalarArgs
): AudienceResponse {
  const { mapping, channels, segmentKey, waveCode, reachBasis } = args
  const { audience_wc, unweighted_n, universe_wc, suppressed_cells } =
    scalarsFromArgs(args)

  const mappedById = new Map(mapping.mapped.map((m) => [m.channelId, m]))
  const ordered = [...channels].sort((a, b) => a.sort_order - b.sort_order)
  const out: AudienceChannelResult[] = []

  for (const meta of ordered) {
    const m = mappedById.get(meta.channel_id)
    if (!m) continue
    mappedById.delete(meta.channel_id)
    const reach_pct = m.reachPct ?? 0
    const reach_wc = m.wc ?? Math.round(reach_pct * audience_wc)
    out.push({
      channel_id: meta.channel_id,
      engine_channel_id: meta.engine_channel_id ?? "",
      reach_wc,
      reach_pct,
      reach_pct_addressable: reach_pct,
      reach_pct_total: reach_pct,
      affinity_by_segment: { [segmentKey]: m.index },
      age_fit: 1,
      gender_fit: 1,
      is_rm_measured: m.provenance !== "benchmark-only",
      age_base: meta.age_base,
      bench: meta.bench,
      mapping_provenance: m.provenance,
      inherited_from: m.inheritedFrom,
    })
  }

  for (const m of mappedById.values()) {
    const reach_pct = m.reachPct ?? 0
    const reach_wc = m.wc ?? Math.round(reach_pct * audience_wc)
    out.push({
      channel_id: m.channelId,
      engine_channel_id: "",
      reach_wc,
      reach_pct,
      reach_pct_addressable: reach_pct,
      reach_pct_total: reach_pct,
      affinity_by_segment: { [segmentKey]: m.index },
      age_fit: 1,
      gender_fit: 1,
      is_rm_measured: m.provenance !== "benchmark-only",
      age_base: 14,
      bench: { attn: null, brand_effect: null, direct_effect: null, cpm: null },
      mapping_provenance: m.provenance,
      inherited_from: m.inheritedFrom,
    })
  }

  return {
    wave_id: waveCode ?? "UPLOAD",
    reach_basis: reachBasis,
    audience_wc,
    unweighted_n,
    universe_wc,
    suppressed_cells,
    channels: out,
  }
}
