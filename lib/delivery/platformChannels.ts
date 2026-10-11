import { MEDIA_TYPE_LABELS } from "@/lib/media/mediaTypes"

/**
 * Channel keys `collectChannelPlans` groups into the delivery snapshot.
 * Social subtypes collapse to the schedule label "Social Media".
 * Programmatic BVOD and Programmatic Audio are schedule labels, and they are
 * not in that snapshot, so they stay off this list.
 */
const PLATFORM_CHANNEL_KEYS = [
  "socialMedia",
  "progDisplay",
  "progVideo",
  "progOoh",
  "digiDisplay",
  "digiVideo",
  "digiAudio",
  "bvod",
  "search",
] as const

/** Schedule labels for those keys. One mapping, used by the hub expected split. */
export const PLATFORM_MEDIA_LABELS: ReadonlySet<string> = new Set(
  PLATFORM_CHANNEL_KEYS.map((key) => MEDIA_TYPE_LABELS[key]),
)

/**
 * Every other `MEDIA_TYPE_LABELS` value. A new label must be added here or to
 * `PLATFORM_CHANNEL_KEYS` before the mapping test passes.
 */
export const NON_PLATFORM_MEDIA_LABELS: ReadonlySet<string> = new Set([
  MEDIA_TYPE_LABELS.television,
  MEDIA_TYPE_LABELS.radio,
  MEDIA_TYPE_LABELS.newspaper,
  MEDIA_TYPE_LABELS.magazines,
  MEDIA_TYPE_LABELS.ooh,
  MEDIA_TYPE_LABELS.cinema,
  MEDIA_TYPE_LABELS.integration,
  MEDIA_TYPE_LABELS.progBvod,
  MEDIA_TYPE_LABELS.progAudio,
  MEDIA_TYPE_LABELS.influencers,
  MEDIA_TYPE_LABELS.production,
])

export function isPlatformMediaType(label: string): boolean {
  return PLATFORM_MEDIA_LABELS.has(label)
}

/** Full month total plus the platform-channel slice. Unknown labels stay in `amount` only. */
export function splitMediaBreakdown(breakdown: Record<string, number>): {
  amount: number
  platformAmount: number
} {
  let amount = 0
  let platformAmount = 0
  for (const [label, value] of Object.entries(breakdown)) {
    if (!Number.isFinite(value)) continue
    amount += value
    if (isPlatformMediaType(label)) platformAmount += value
  }
  return { amount, platformAmount }
}
