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
    case "ad-serving":
      // Ad serving is not a media type; borrows digital_display until a dedicated token exists.
      return "digital_display"
  }
}

/**
 * Media-type accent for a delivery channel container.
 * Always registry-backed — never client brand (brand stays on hero / timeline / chart props).
 */
export function channelMediaTypeColour(key: ChannelKey): string {
  return getMediaColor(channelMediaRegistryKey(key))
}
