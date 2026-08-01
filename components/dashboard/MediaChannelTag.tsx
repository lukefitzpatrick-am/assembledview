"use client"

import { getMediaBadgeStyle } from "@/lib/charts/registry"
import { cn } from "@/lib/utils"

/** Pill shape aligned with dashboard badge tokens. */
const mediaChannelTagClassName =
  "inline-flex items-center rounded-pill border px-2 py-0.5 text-xs font-medium"

/** Row wrapper for media type tags on dashboard + mediaplans list (grid + table). */
export const mediaChannelTagRowClassName = "flex flex-wrap gap-1.5"

/**
 * Media-type pill. Colours come from `getMediaBadgeStyle` → `MEDIA_TYPE_REGISTRY`
 * (mirrors `mediaTypeTheme`); no local tone map — every canonical type is covered.
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
      {label}
    </span>
  )
}
