"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type ConstraintChannel = {
  id: string
  name: string
}

type StageConstraintsProps = {
  channels: ConstraintChannel[]
  excludedChannelIds: string[]
  onToggle: (engineChannelId: string) => void
  onContinue: () => void
  onBack: () => void
}

export function StageConstraints({
  channels,
  excludedChannelIds,
  onToggle,
  onContinue,
  onBack,
}: StageConstraintsProps) {
  const excluded = new Set(excludedChannelIds)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-medium">Constraints</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Exclude channels from scoring and the compare table. Included by default.
        </p>
      </div>

      <div className="rounded-card border border-border bg-card p-5 shadow-e1">
        {channels.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Load at least one audience in Stage B to see scored channels.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {channels.map((ch) => {
              const isExcluded = excluded.has(ch.id)
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => onToggle(ch.id)}
                  className={cn(
                    "rounded-full border-0 bg-transparent p-0",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  )}
                >
                  <Badge
                    variant={isExcluded ? "outline" : "info"}
                    size="sm"
                    className={cn(
                      "cursor-pointer border transition-colors",
                      isExcluded && "text-muted-foreground line-through opacity-70"
                    )}
                  >
                    {ch.name}
                    {isExcluded ? " · excluded" : ""}
                  </Badge>
                </button>
              )
            })}
          </div>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">
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
