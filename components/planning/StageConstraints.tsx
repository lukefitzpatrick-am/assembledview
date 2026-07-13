"use client"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"

export type ConstraintChannel = {
  id: string
  name: string
  group: string
}

type StageConstraintsProps = {
  channels: ConstraintChannel[]
  excludedChannelIds: string[]
  onToggle: (engineChannelId: string) => void
  onContinue: () => void
  onBack: () => void
}

type ChannelGroup = {
  group: string
  channels: ConstraintChannel[]
}

function groupChannels(channels: ConstraintChannel[]): ChannelGroup[] {
  const byGroup = new Map<string, ConstraintChannel[]>()
  for (const ch of channels) {
    const list = byGroup.get(ch.group)
    if (list) list.push(ch)
    else byGroup.set(ch.group, [ch])
  }
  return [...byGroup.entries()].map(([group, groupChannels]) => ({
    group,
    channels: groupChannels,
  }))
}

export function StageConstraints({
  channels,
  excludedChannelIds,
  onToggle,
  onContinue,
  onBack,
}: StageConstraintsProps) {
  const excluded = new Set(excludedChannelIds)
  const groups = groupChannels(channels)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-medium">Constraints</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          All channels are included by default. Untick a channel to exclude it from
          scoring, the recommended split and the compare charts.
        </p>
      </div>

      <div className="rounded-card border border-border bg-card p-5 shadow-e1 space-y-5">
        {channels.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Load at least one audience in Stage B to see scored channels.
          </p>
        ) : (
          groups.map((g) => (
            <div key={g.group} className="space-y-2">
              <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {g.group}
              </h3>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {g.channels.map((ch) => {
                  const checked = !excluded.has(ch.id)
                  const id = `constraint-${ch.id}`
                  return (
                    <li key={ch.id}>
                      <label
                        htmlFor={id}
                        className={cn(
                          "flex cursor-pointer items-center gap-2.5 rounded-input px-2 py-1.5",
                          "interactive-tint transition-colors",
                          !checked && "opacity-70"
                        )}
                      >
                        <Checkbox
                          id={id}
                          checked={checked}
                          onCheckedChange={() => onToggle(ch.id)}
                        />
                        <span
                          className={cn(
                            "text-sm",
                            !checked && "text-muted-foreground line-through"
                          )}
                        >
                          {ch.name}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))
        )}
        <p className="text-[11px] text-muted-foreground">
          {excludedChannelIds.length === 0
            ? "All channels included."
            : `${excludedChannelIds.length} channel(s) excluded from mix & compare.`}
        </p>
      </div>

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="button" onClick={onContinue}>
          Continue to compare
        </Button>
      </div>
    </div>
  )
}
