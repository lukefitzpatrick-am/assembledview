import type { PlanningChannelMeta } from "../types"
import { isPlanningEngineLeaf } from "./mapRoyMorganToChannels"

/** Filter labels other than the national "All cases" base must be surfaced, never silent. */
export function isFilteredRmRun(filterLabel: string | null | undefined): boolean {
  if (filterLabel == null) return false
  const t = filterLabel.trim()
  if (!t) return false
  return t.toLowerCase() !== "all cases"
}

export type UncoveredLeafGroup = {
  level1: string
  rollup: PlanningChannelMeta | null
  rollupCovered: boolean
  leaves: PlanningChannelMeta[]
}

/**
 * Uncovered engine leaves grouped by LEVEL1 for UploadCoveragePanel.
 * Inherit is offered only when that group's rollup is already in `coveredIds`.
 */
export function groupUncoveredLeaves(opts: {
  uncoveredLeafIds: string[]
  channels: PlanningChannelMeta[]
  coveredIds: Set<string>
}): UncoveredLeafGroup[] {
  const byId = new Map(opts.channels.map((c) => [c.channel_id, c]))
  const uncovered = opts.uncoveredLeafIds
    .map((id) => byId.get(id))
    .filter((c): c is PlanningChannelMeta => c != null && isPlanningEngineLeaf(c))

  const groups = new Map<string, PlanningChannelMeta[]>()
  for (const leaf of uncovered) {
    const level1 = leaf.level1 ?? "Other"
    const list = groups.get(level1) ?? []
    list.push(leaf)
    groups.set(level1, list)
  }

  const out: UncoveredLeafGroup[] = []
  for (const [level1, leaves] of groups) {
    const rollup =
      opts.channels.find(
        (c) =>
          (c.level1 ?? "Other") === level1 &&
          !isPlanningEngineLeaf(c) &&
          c.channel_id !== "POPULATION"
      ) ?? null
    out.push({
      level1,
      rollup,
      rollupCovered: rollup != null && opts.coveredIds.has(rollup.channel_id),
      leaves: leaves.toSorted((a, b) => a.sort_order - b.sort_order),
    })
  }
  return out.toSorted((a, b) => a.level1.localeCompare(b.level1))
}
