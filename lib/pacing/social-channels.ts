/**
 * Shared constants and helpers for social pacing channels.
 * Social channels (Social - Meta, Social - TikTok) live in SOCIAL_PACING_FACT.
 * Non-social (programmatic) remains in PACING_FACT.
 */

/** Canonical display names for social pacing channels in Snowflake. */
export const SOCIAL_PACING_CHANNEL_NAMES = ["Social - Meta", "Social - TikTok"] as const

/** Normalized channel types used by the app for social pacing. */
export const SOCIAL_PACING_CHANNEL_TYPES = ["meta", "tiktok"] as const

export type SocialPacingChannelType = (typeof SOCIAL_PACING_CHANNEL_TYPES)[number]

/** Snowflake table for social pacing data. */
export const SOCIAL_PACING_TABLE = "ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT"

/**
 * Returns true if the channel type is a social pacing channel (meta or tiktok).
 */
export function isSocialPacingChannel(channel: string): boolean {
  const lower = String(channel ?? "").trim().toLowerCase()
  return (SOCIAL_PACING_CHANNEL_TYPES as readonly string[]).includes(lower)
}

/**
 * Returns true if a media type string indicates social (e.g. "Social - Meta", "meta", "tiktok", "social").
 * Used for routing queries between SOCIAL_PACING_FACT and PACING_FACT.
 */
export function isSocialMediaType(mt: string): boolean {
  const lower = String(mt ?? "").trim().toLowerCase()
  return (
    SOCIAL_PACING_CHANNEL_NAMES.some((name) => lower.includes(name.toLowerCase())) ||
    SOCIAL_PACING_CHANNEL_TYPES.some((type) => lower.includes(type)) ||
    /\bsocial\b/.test(lower)
  )
}

/**
 * Returns the SQL condition for matching social channels in Snowflake.
 * Snowflake CHANNEL values may not be normalised (case/wording varies),
 * so we match using LOWER() + LIKE patterns.
 */
export function getSocialChannelSqlCondition(): string {
  return SOCIAL_PACING_CHANNEL_TYPES.map((t) => `LOWER(CHANNEL) LIKE '%${t}%'`).join(" OR ")
}
