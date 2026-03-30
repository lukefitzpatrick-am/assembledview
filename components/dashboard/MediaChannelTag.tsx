"use client"

import { getMediaChannelBadgeStyle } from "@/lib/media/channelColors"
import { cn } from "@/lib/utils"

/** Pill shape aligned with admin `/dashboard` media badges (`Badge` → `rounded-full`). */
export const mediaChannelTagClassName =
  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"

/** Row wrapper for media type tags on dashboard + mediaplans list (grid + table). */
export const mediaChannelTagRowClassName = "flex flex-wrap gap-1.5"

export function MediaChannelTag({
  label,
  className,
}: {
  label: string
  className?: string
}) {
  return (
    <span className={cn(mediaChannelTagClassName, className)} style={getMediaChannelBadgeStyle(label)}>
      {label}
    </span>
  )
}
