"use client"

import { cn } from "@/lib/utils"
import {
  CAMPAIGN_DATE_PRESETS,
  campaignDateRangeForPreset,
  type CampaignDatePresetId,
  type CampaignDateRange,
} from "@/lib/mediaplan/campaignDatePresets"

/**
 * Quick campaign date-range presets for the builder header pickers.
 */
export function CampaignDatePresetBar({
  onApply,
  className,
  presets = CAMPAIGN_DATE_PRESETS,
  label = "Quick",
}: {
  onApply: (range: CampaignDateRange) => void
  className?: string
  presets?: ReadonlyArray<{ id: CampaignDatePresetId; label: string }>
  label?: string
}) {
  const apply = (id: CampaignDatePresetId) => {
    onApply(campaignDateRangeForPreset(id))
  }

  return (
    <div
      role="group"
      aria-label="Campaign date presets"
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {presets.map(({ id, label: presetLabel }) => (
        <button
          key={id}
          type="button"
          onClick={() => apply(id)}
          className={cn(
            "rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] font-medium text-muted-foreground",
            "transition-colors hover:bg-muted hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
        >
          {presetLabel}
        </button>
      ))}
    </div>
  )
}
