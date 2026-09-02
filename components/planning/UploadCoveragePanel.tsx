"use client"

import { Checkbox } from "@/components/ui/checkbox"
import type { PlanningChannelMeta } from "@/lib/planning/types"
import {
  groupUncoveredLeaves,
  isFilteredRmRun,
} from "@/lib/planning/upload/coverageHonesty"
import type { RmMappingOptions } from "@/lib/planning/upload/mapRoyMorganToChannels"
import { cn } from "@/lib/utils"

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

  const toggleInherit = (rollupId: string, leafIds: string[], checked: boolean) => {
    const nextInherit = new Set(inherit)
    if (checked) nextInherit.add(rollupId)
    else nextInherit.delete(rollupId)
    const nextBench = new Set(bench)
    if (checked) {
      for (const id of leafIds) nextBench.delete(id)
    }
    onChangeOptions({
      ...options,
      inheritRollupIds: [...nextInherit],
      benchmarkOnlyIds: [...nextBench],
    })
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
          {groups.map((group) => {
            const rollupId = group.rollup?.channel_id
            const inherited =
              group.rollupCovered && rollupId != null && inherit.has(rollupId)
            return (
              <li key={group.level1} className="space-y-1.5">
                <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-start sm:gap-3">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {group.level1}
                  </div>
                  {group.rollupCovered && group.rollup ? (
                    <label className="inline-flex items-start gap-2 text-xs">
                      <Checkbox
                        checked={inherit.has(group.rollup.channel_id)}
                        onCheckedChange={(v) =>
                          toggleInherit(
                            group.rollup!.channel_id,
                            group.leaves.map((leaf) => leaf.channel_id),
                            v === true
                          )
                        }
                      />
                      <span>
                        Inherit {group.level1} reach and index for the {group.leaves.length}{" "}
                        uncovered channels below
                      </span>
                    </label>
                  ) : null}
                </div>
                {group.leaves.map((leaf) => {
                  const label = leaf.level2 ?? leaf.channel_id
                  const benchChecked = !inherited && bench.has(leaf.channel_id)
                  return (
                    <div
                      key={leaf.channel_id}
                      className={cn("space-y-1 pl-1", inherited && "text-muted-foreground")}
                    >
                      <div className="text-xs">{label}</div>
                      <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                        <label
                          className={cn(
                            "inline-flex items-center gap-2 text-xs",
                            inherited && "opacity-60"
                          )}
                        >
                          <Checkbox
                            checked={benchChecked}
                            disabled={inherited}
                            onCheckedChange={(v) => {
                              if (inherited) return
                              toggleBench(leaf.channel_id, v === true)
                            }}
                          />
                          Include on benchmark only
                        </label>
                      </div>
                      {inherited ? (
                        <p className="text-[11px] text-muted-foreground">
                          inherited from {group.level1}
                        </p>
                      ) : benchChecked ? (
                        <p className="text-[11px] text-status-behind-fg">
                          Takes budget, contributes zero measured reach.
                        </p>
                      ) : null}
                    </div>
                  )
                })}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
