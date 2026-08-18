import { getMediaColor } from "@/lib/charts/registry"

import type { ChannelKey } from "./types"

/** Registry / alias key for `getMediaColor` / `getMediaBadgeStyle`. */
export function channelMediaRegistryKey(key: ChannelKey): string {
  switch (key) {
    case "social-meta":
    case "social-tiktok":
      return "socialmedia"
    case "search":
      return "search"
    case "programmatic-display":
      return "prog_display"
    case "programmatic-video":
      return "prog_video"
    case "digital-display":
      return "digital_display"
    case "digital-video":
      return "digital_video"
    case "digital-audio":
      return "digital_audio"
    case "bvod":
      return "bvod"
  }
}

/**
 * Media-type accent for a delivery channel container.
 * Always registry-backed — never client brand (brand stays on hero / timeline / chart props).
 */
export function channelMediaTypeColour(key: ChannelKey): string {
  return getMediaColor(channelMediaRegistryKey(key))
}
