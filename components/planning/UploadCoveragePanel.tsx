"use client"

import { Checkbox } from "@/components/ui/checkbox"
import type { PlanningChannelMeta } from "@/lib/planning/types"
import {
  groupUncoveredLeaves,
  isFilteredRmRun,
} from "@/lib/planning/upload/coverageHonesty"
import type { RmMappingOptions } from "@/lib/planning/upload/mapRoyMorganToChannels"

type UploadCoveragePanelProps = {
  scoreableCount: number
  leafCount: number
  uncoveredLeafIds: string[]
  coveredIds: Set<string>
  channels: PlanningChannelMeta[]
  filterLabel: string | null | undefined
  options: RmMappingOptions
  onChangeOptions: (next: RmMappingOptions) => void
}

export function UploadCoveragePanel({
  scoreableCount,
  leafCount,
  uncoveredLeafIds,
  coveredIds,
  channels,
  filterLabel,
  options,
  onChangeOptions,
}: UploadCoveragePanelProps) {
  const groups = groupUncoveredLeaves({ uncoveredLeafIds, channels, coveredIds })
  const inherit = new Set(options.inheritRollupIds)
  const bench = new Set(options.benchmarkOnlyIds)
  const filtered = isFilteredRmRun(filterLabel)

  const toggleInherit = (rollupId: string, checked: boolean) => {
    const next = new Set(inherit)
    if (checked) next.add(rollupId)
    else next.delete(rollupId)
    onChangeOptions({ ...options, inheritRollupIds: [...next] })
  }

  const toggleBench = (leafId: string, checked: boolean) => {
    const next = new Set(bench)
    if (checked) next.add(leafId)
    else next.delete(leafId)
    onChangeOptions({ ...options, benchmarkOnlyIds: [...next] })
  }

  return (
    <div className="space-y-3 rounded-card border border-border bg-surface-panel p-3">
      {filtered ? (
        <p className="text-xs text-status-behind-fg">
          This run is filtered to &apos;{filterLabel}&apos;. Indexes are against that base, not
          the national 14+ base.
        </p>
      ) : null}
      <p className="text-sm">
        {scoreableCount} of {leafCount} planning channels covered by this run.
      </p>
      {groups.length === 0 ? (
        <p className="text-xs text-muted-foreground">Every planning leaf is covered.</p>
      ) : (
        <ul className="space-y-3">
          {groups.map((group) => (
            <li key={group.level1} className="space-y-1.5">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {group.level1}
              </div>
              {group.leaves.map((leaf) => {
                const label = leaf.level2 ?? leaf.channel_id
                return (
                  <div key={leaf.channel_id} className="space-y-1 pl-1">
                    <div className="text-xs">{label}</div>
                    <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                      {group.rollupCovered && group.rollup ? (
                        <label className="inline-flex items-center gap-2 text-xs">
                          <Checkbox
                            checked={inherit.has(group.rollup.channel_id)}
                            onCheckedChange={(v) =>
                              toggleInherit(group.rollup!.channel_id, v === true)
                            }
                          />
                          Inherit from {group.level1}
                        </label>
                      ) : null}
                      <label className="inline-flex items-center gap-2 text-xs">
                        <Checkbox
                          checked={bench.has(leaf.channel_id)}
                          onCheckedChange={(v) => toggleBench(leaf.channel_id, v === true)}
                        />
                        Include on benchmark only
                      </label>
                    </div>
                    {bench.has(leaf.channel_id) ? (
                      <p className="text-[11px] text-status-behind-fg">
                        Takes budget, contributes zero measured reach.
                      </p>
                    ) : null}
                  </div>
                )
              })}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
