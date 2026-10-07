"use client"

import { getMediaBadgeStyle, getMediaDotColour } from "@/lib/charts/registry"
import { cn } from "@/lib/utils"

/** Pill shape aligned with dashboard badge tokens. */
const mediaChannelTagClassName =
  "inline-flex items-center gap-1.5 rounded-pill border px-2 py-0.5 text-xs font-medium"

/** Row wrapper for media type tags on dashboard + mediaplans list (grid + table). */
export const mediaChannelTagRowClassName = "flex flex-wrap gap-1.5"

/**
 * Media-type pill. Neutral fill from `getMediaBadgeStyle`; the dot is the channel family.
 */
export function MediaChannelTag({
  label,
  className,
}: {
  label: string
  className?: string
}) {
  const badge = getMediaBadgeStyle(label)
  return (
    <span
      className={cn(mediaChannelTagClassName, className)}
      style={{
        backgroundColor: badge.backgroundColor,
        color: badge.color,
        borderColor: badge.borderColor,
      }}
    >
      <span
        className="size-2 shrink-0 rounded-full border border-foreground/15"
        style={{ backgroundColor: getMediaDotColour(label) }}
        aria-hidden
      />
      {label}
    </span>
  )
}
