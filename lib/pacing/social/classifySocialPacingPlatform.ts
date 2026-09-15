import type { SocialPlatform } from "@/lib/pacing/social/types"

function isMetaPlatformString(value: unknown): boolean {
  return /\b(meta|facebook|instagram|ig)\b/i.test(String(value ?? ""))
}

function isTikTokPlatformString(value: unknown): boolean {
  return /\btik\s*tok\b/i.test(String(value ?? ""))
}

function isRedditPlatformString(value: unknown): boolean {
  return /\breddit\b/i.test(String(value ?? ""))
}

/**
 * Attach a social plan line to a Snowflake social channel.
 * Meta / TikTok / Reddit only — anything else is unclassified (null).
 */
export function classifySocialPacingPlatform(row: Record<string, unknown>): SocialPlatform | null {
  const platform = String(row.platform ?? "").trim()
  if (platform) {
    if (isMetaPlatformString(platform)) return "meta"
    if (isTikTokPlatformString(platform)) return "tiktok"
    if (isRedditPlatformString(platform)) return "reddit"
  }
  const fallbackName = String(
    row.line_item_name ??
      row.lineItemName ??
      row.creative_targeting ??
      row.creativeTargeting ??
      row.creative ??
      "",
  )
    .trim()
    .toUpperCase()
  if (/(^|[^A-Z])(FB|IG|META)([^A-Z]|$)/.test(fallbackName)) return "meta"
  if (/(^|[^A-Z])(TT|TIKTOK)([^A-Z]|$)/.test(fallbackName)) return "tiktok"
  if (/(^|[^A-Z])(REDDIT)([^A-Z]|$)/.test(fallbackName)) return "reddit"
  return null
}
