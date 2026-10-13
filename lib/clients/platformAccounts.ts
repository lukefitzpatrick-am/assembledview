/**
 * Client-safe account-ref normalisers. No database or Snowflake imports.
 * Numeric platforms store digits only. CM360, DV360, LinkedIn, Pinterest
 * and Snapchat store the trimmed text the operator typed (advertiser name
 * for the two Google platforms).
 */

export const PLATFORM_ACCOUNT_PLATFORMS = [
  "meta_ads",
  "google_ads",
  "cm360",
  "dv360",
  "tiktok",
  "reddit",
  "taboola",
  "vistar",
  "channel_factory",
  "linkedin",
  "pinterest",
  "snapchat",
] as const

export type PlatformAccountPlatform = (typeof PLATFORM_ACCOUNT_PLATFORMS)[number]

const DIGIT_PLATFORMS = new Set<PlatformAccountPlatform>([
  "meta_ads",
  "google_ads",
  "tiktok",
  "reddit",
  "taboola",
  "vistar",
  "channel_factory",
])

export function isPlatformAccountPlatform(value: string): value is PlatformAccountPlatform {
  return (PLATFORM_ACCOUNT_PLATFORMS as readonly string[]).includes(value)
}

export function normaliseAccountRef(platform: string, raw: string): string {
  if (!isPlatformAccountPlatform(platform)) {
    throw new Error("Unknown platform")
  }
  if (DIGIT_PLATFORMS.has(platform)) {
    const stripped = String(raw ?? "")
      .trim()
      .replace(/^act_/i, "")
      .replace(/[- ]/g, "")
    if (!/^\d+$/.test(stripped)) {
      throw new Error("Account ref must be digits")
    }
    return stripped
  }
  const text = String(raw ?? "").trim()
  if (!text) {
    throw new Error("Account ref is empty")
  }
  return text
}

/** Display form. Stored values stay digits or exact names. */
export function formatAccountRef(platform: string, ref: string): string {
  if (platform === "google_ads" && /^\d{10}$/.test(ref)) {
    return `${ref.slice(0, 3)}-${ref.slice(3, 6)}-${ref.slice(6)}`
  }
  if (platform === "meta_ads" && /^\d+$/.test(ref)) {
    return `act_${ref}`
  }
  return ref
}

export const PLATFORM_ACCOUNT_LABELS: Record<PlatformAccountPlatform, string> = {
  meta_ads: "Meta ads",
  google_ads: "Google Ads",
  cm360: "CM360",
  dv360: "DV360",
  tiktok: "TikTok",
  reddit: "Reddit",
  taboola: "Taboola",
  vistar: "Vistar",
  channel_factory: "Channel Factory",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
  snapchat: "Snapchat",
}

export function isAdvertiserNamePlatform(
  platform: string,
): platform is "cm360" | "dv360" {
  return platform === "cm360" || platform === "dv360"
}
