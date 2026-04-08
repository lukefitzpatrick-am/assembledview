import type { ChannelKey } from "@/lib/finance/lineItemDescription"
import type { FinanceLineItemForDescription } from "@/lib/finance/lineItemDescription"
import { detectChannel } from "@/lib/finance/lineItemDescription"

const ACCENT_PALETTE = [
  "#534AB7", // purple
  "#1D9E75", // teal
  "#D85A30", // coral
  "#378ADD", // blue
  "#BA7517", // amber
] as const

function deriveInitials(name: string | null | undefined): string {
  const raw = name == null ? "" : String(name)
  const parts = raw.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase()
  return (parts[0]!.slice(0, 1) + parts[1]!.slice(0, 1)).toUpperCase()
}

function pickAccent(seed: number): string {
  const h = Math.abs(Math.imul(seed | 0, 2654435761) | 0)
  return ACCENT_PALETTE[h % ACCENT_PALETTE.length]!
}

export function clientInitials(name: string): string {
  return deriveInitials(name)
}

export function publisherInitials(name: string): string {
  return deriveInitials(name)
}

export function clientAccentColour(id: number): string {
  return pickAccent(id)
}

export function publisherAccentColour(id: number): string {
  return pickAccent(id)
}

function channelKeyMediaBadgeClass(key: ChannelKey): string {
  switch (key) {
    case "television":
    case "radio":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300"
    case "newspapers":
    case "magazines":
      return "bg-orange-500/15 text-orange-700 dark:text-orange-300"
    case "ooh":
    case "cinema":
      return "bg-pink-500/15 text-pink-700 dark:text-pink-300"
    case "digital_display":
    case "digital_audio":
    case "digital_video":
    case "bvod":
      return "bg-blue-500/15 text-blue-700 dark:text-blue-300"
    case "search":
      return "bg-green-500/15 text-green-700 dark:text-green-300"
    case "social":
      return "bg-violet-500/15 text-violet-700 dark:text-violet-300"
    case "prog_display":
    case "prog_audio":
    case "prog_video":
    case "prog_ooh":
      return "bg-teal-500/15 text-teal-700 dark:text-teal-300"
    case "fees":
    case "retainer":
    case "unknown":
    default:
      return "bg-muted text-muted-foreground"
  }
}

/**
 * Tinted badge classes for a media type string. Channel detection matches
 * {@link detectChannel} / line item description logic.
 */
export function mediaTypeBadgeClass(mediaType: string): string {
  const synthetic = {
    media_type: mediaType?.trim() ? mediaType : null,
    line_type: "media" as const,
  } as FinanceLineItemForDescription
  const key = detectChannel(synthetic)
  return channelKeyMediaBadgeClass(key)
}
