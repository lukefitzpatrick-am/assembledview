import type { PlanningChannelMeta } from "../types"
import { normaliseRmLabel, RM_LABEL_ALIASES } from "./royMorganAliases"
import type { RmBlock } from "./royMorganTypes"

export type RmMappingOverrides = Record<number, string | null>

export type RmMappingOptions = {
  inheritRollupIds: string[]
  benchmarkOnlyIds: string[]
}

export type RmMappedChannel = {
  channelId: string
  sourceLabel: string
  sourceRowIndex: number | null
  reachPct: number | null
  index: number | null
  wc: number | null
  provenance: "matched" | "inherited" | "benchmark-only"
  inheritedFrom: string | null
}

export type RmMappingResult = {
  mapped: RmMappedChannel[]
  unmatchedRows: {
    rowIndex: number
    label: string
    section: string | null
    suggestion: string | null
  }[]
  uncoveredLeafIds: string[]
  duplicateChannelIds: string[]
  scoreableCount: number
}

const SKIP_SECTIONS = [
  /^states$/i,
  /^sex$/i,
  /^age\b/i,
  /^capital city\/country$/i,
  /^capital city\/country areas$/i,
  /- agree$/i,
]

function isDemographicSection(section: string | null): boolean {
  if (!section) return false
  const t = section.trim()
  return SKIP_SECTIONS.some((re) => re.test(t))
}

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 0)
  )
}

function tokenOverlap(a: string, b: string): number {
  const ta = tokens(a)
  const tb = tokens(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) {
    if (tb.has(t)) inter += 1
  }
  const union = new Set([...ta, ...tb]).size
  return union === 0 ? 0 : inter / union
}

function isLeaf(ch: PlanningChannelMeta): boolean {
  return ch.engine_channel_id != null && ch.engine_channel_id.trim() !== ""
}

function suggestionFor(
  label: string,
  channels: PlanningChannelMeta[]
): string | null {
  const q = normaliseRmLabel(label)
  let best: { id: string; score: number } | null = null
  for (const ch of channels) {
    if (!isLeaf(ch)) continue
    const level2 = ch.level2 ? normaliseRmLabel(ch.level2) : ""
    const idWords = normaliseRmLabel(ch.channel_id.replace(/_/g, " "))
    const score = Math.max(
      level2 ? tokenOverlap(q, level2) : 0,
      tokenOverlap(q, idWords)
    )
    if (!best || score > best.score) best = { id: ch.channel_id, score }
  }
  if (!best || best.score < 0.6) return null
  return best.id
}

function exactDimMatch(
  label: string,
  channels: PlanningChannelMeta[]
): string | null {
  const q = normaliseRmLabel(label)
  for (const ch of channels) {
    if (ch.level2 && normaliseRmLabel(ch.level2) === q) return ch.channel_id
  }
  for (const ch of channels) {
    if (ch.level1 && normaliseRmLabel(ch.level1) === q) return ch.channel_id
  }
  return null
}

export function mapRoyMorganToChannels(args: {
  block: RmBlock
  channels: PlanningChannelMeta[]
  overrides?: RmMappingOverrides
  options?: RmMappingOptions
}): RmMappingResult {
  const { block, channels } = args
  const overrides = args.overrides ?? {}
  const options = args.options ?? { inheritRollupIds: [], benchmarkOnlyIds: [] }
  const byId = new Map(channels.map((c) => [c.channel_id, c]))
  const mapped: RmMappedChannel[] = []
  const unmatchedRows: RmMappingResult["unmatchedRows"] = []
  const duplicateChannelIds: string[] = []
  const claimed = new Set<string>()

  const pushMapped = (row: RmMappedChannel) => {
    if (claimed.has(row.channelId)) {
      if (!duplicateChannelIds.includes(row.channelId)) {
        duplicateChannelIds.push(row.channelId)
      }
      return
    }
    claimed.add(row.channelId)
    mapped.push(row)
  }

  for (const row of block.rows) {
    if (isDemographicSection(row.section)) continue
    if (Object.prototype.hasOwnProperty.call(overrides, row.rowIndex)) {
      const ov = overrides[row.rowIndex]
      if (ov == null) continue
      pushMapped({
        channelId: ov,
        sourceLabel: row.label,
        sourceRowIndex: row.rowIndex,
        reachPct: row.reachPct,
        index: row.index,
        wc: row.wc,
        provenance: "matched",
        inheritedFrom: null,
      })
      continue
    }
    const aliasHit = RM_LABEL_ALIASES[normaliseRmLabel(row.label)]
    const dimHit = aliasHit ?? exactDimMatch(row.label, channels)
    if (!dimHit) {
      unmatchedRows.push({
        rowIndex: row.rowIndex,
        label: row.label,
        section: row.section,
        suggestion: suggestionFor(row.label, channels),
      })
      continue
    }
    pushMapped({
      channelId: dimHit,
      sourceLabel: row.label,
      sourceRowIndex: row.rowIndex,
      reachPct: row.reachPct,
      index: row.index,
      wc: row.wc,
      provenance: "matched",
      inheritedFrom: null,
    })
  }

  const covered = new Set(mapped.map((m) => m.channelId))
  const leaves = channels.filter((c) => isLeaf(c))

  for (const rollupId of options.inheritRollupIds) {
    const source = mapped.find((m) => m.channelId === rollupId)
    const rollup = byId.get(rollupId)
    if (!source || !rollup) continue
    for (const leaf of leaves) {
      if (leaf.level1 !== rollup.level1) continue
      if (leaf.channel_id === rollupId) continue
      if (covered.has(leaf.channel_id)) continue
      pushMapped({
        channelId: leaf.channel_id,
        sourceLabel: source.sourceLabel,
        sourceRowIndex: null,
        reachPct: source.reachPct,
        index: source.index,
        wc: source.wc,
        provenance: "inherited",
        inheritedFrom: rollupId,
      })
      covered.add(leaf.channel_id)
    }
  }

  for (const id of options.benchmarkOnlyIds) {
    if (covered.has(id)) continue
    const meta = byId.get(id)
    if (!meta) continue
    pushMapped({
      channelId: id,
      sourceLabel: meta.level2 ?? meta.level1 ?? meta.channel_id,
      sourceRowIndex: null,
      reachPct: 0,
      index: null,
      wc: null,
      provenance: "benchmark-only",
      inheritedFrom: null,
    })
    covered.add(id)
  }

  const uncoveredLeafIds = leaves
    .map((c) => c.channel_id)
    .filter((id) => !covered.has(id))

  const scoreableCount = mapped.filter((m) => {
    const meta = byId.get(m.channelId)
    return meta?.engine_channel_id != null && meta.engine_channel_id !== ""
  }).length

  return {
    mapped,
    unmatchedRows,
    uncoveredLeafIds,
    duplicateChannelIds,
    scoreableCount,
  }
}
