import { AudioLines, Facebook, Gauge, MonitorPlay, Music2, Search, Tv, Video } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { ChannelKey } from "./types"

export function getChannelIcon(key: ChannelKey): LucideIcon {
  switch (key) {
    case "social-meta":
      return Facebook
    case "social-tiktok":
      return Music2
    case "search":
      return Search
    case "programmatic-display":
      return Gauge
    case "programmatic-video":
      return MonitorPlay
    case "digital-display":
      return MonitorPlay
    case "digital-video":
      return Video
    case "digital-audio":
      return AudioLines
    case "bvod":
      return Tv
  }
}
