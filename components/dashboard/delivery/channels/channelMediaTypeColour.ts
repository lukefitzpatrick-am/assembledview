import { getMediaColor } from "@/lib/charts/registry"

import type { ChannelKey } from "./types"

/**
 * Media-type accent for a delivery channel container.
 * Always registry-backed — never client brand (brand stays on hero / timeline / chart props).
 */
export function channelMediaTypeColour(key: ChannelKey): string {
  switch (key) {
    case "social-meta":
    case "social-tiktok":
      return getMediaColor("socialmedia")
    case "search":
      return getMediaColor("search")
    case "programmatic-display":
      return getMediaColor("prog_display")
    case "programmatic-video":
      return getMediaColor("prog_video")
    case "ad-serving":
      // Ad serving is not a media type; borrows digital_display until a dedicated token exists.
      return getMediaColor("digital_display")
  }
}
