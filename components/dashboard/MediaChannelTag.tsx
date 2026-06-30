"use client"

import { normalizeEntityKey } from "@/lib/charts/registry"
import { cn } from "@/lib/utils"

/** Pill shape aligned with dashboard badge tokens. */
const mediaChannelTagClassName =
  "inline-flex items-center rounded-pill border px-2 py-0.5 text-xs font-medium"

/** Row wrapper for media type tags on dashboard + mediaplans list (grid + table). */
export const mediaChannelTagRowClassName = "flex flex-wrap gap-1.5"

const mediaChannelTagTone: Record<string, string> = {
  television: "border-channel-tv bg-pacing-critical-bg text-status-critical-fg",
  cinema: "border-channel-tv bg-pacing-critical-bg text-status-critical-fg",
  bvod: "border-channel-bvod bg-surface-panel text-channel-bvod",
  prog_bvod: "border-channel-bvod bg-surface-panel text-channel-bvod",
  prog_video: "border-channel-bvod bg-surface-panel text-channel-bvod",
  digital_video: "border-channel-bvod bg-surface-panel text-channel-bvod",
  social_media: "border-channel-social bg-channel-social-bg text-channel-social-fg",
  influencers: "border-channel-social bg-channel-social-bg text-channel-social-fg",
  prog_display: "border-channel-progDisplay bg-pacing-behind-bg text-status-behind-fg",
  digital_display: "border-channel-progDisplay bg-pacing-behind-bg text-status-behind-fg",
  search: "border-channel-search bg-pacing-ahead-bg text-status-ahead-fg",
  ooh: "border-channel-ooh bg-pacing-ahead-bg text-status-ahead-fg",
  prog_ooh: "border-channel-ooh bg-pacing-ahead-bg text-status-ahead-fg",
}

function mediaChannelTagToneClassName(label: string) {
  return mediaChannelTagTone[normalizeEntityKey(label)] ?? "border-border bg-surface-panel text-muted-foreground"
}

export function MediaChannelTag({
  label,
  className,
}: {
  label: string
  className?: string
}) {
  return (
    <span className={cn(mediaChannelTagClassName, mediaChannelTagToneClassName(label), className)}>
      {label}
    </span>
  )
}
