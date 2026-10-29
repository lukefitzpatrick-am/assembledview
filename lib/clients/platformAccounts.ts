/**
 * Client-safe account-ref normalisers. No database or Snowflake imports.
 * Numeric platforms store digits only. GA4 stores the property id digits.
 * Search Console stores the Fivetran SITE string. CM360, DV360, LinkedIn,
 * Pinterest and Snapchat store the trimmed text the operator typed
 * (advertiser name for the two Google platforms).
 *
 * meta_page is the client's Facebook / Instagram page id (digits), used for
 * creative avatars and mockups. It is not an ad account: meta_ads is the ad
 * account. It replaces the legacy clients.idmeta column, which stays as a
 * read fallback until the data is moved (see pickMetaPageId).
 */

export const PLATFORM_ACCOUNT_PLATFORMS = [
  "meta_ads",
  "meta_page",
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
  "ga4",
  "gsc",
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

/**
 * GA4 and Search Console stay off the client page until
 * the platform_accounts_web switch is on (Admin > Features; with no switch
 * row, NEXT_PUBLIC_PLATFORM_ACCOUNTS_WEB exactly "1"). Callers pass "1" when on.
 */
export function platformAccountChoices(flag?: string): readonly PlatformAccountPlatform[] {
  if (flag === "1") return PLATFORM_ACCOUNT_PLATFORMS
  return PLATFORM_ACCOUNT_PLATFORMS.filter((value) => value !== "ga4" && value !== "gsc")
}

function normaliseGa4(raw: string): string {
  const text = String(raw ?? "").trim()
  if (/^properties\/\d+\/?$/i.test(text)) {
    const digits = text.match(/(\d+)/)
    if (digits) return digits[1]
  }
  if (/^\d+$/.test(text)) return text
  let url: URL | null = null
  try {
    url = new URL(text)
  } catch {
    url = null
  }
  if (!url) throw new Error("Account ref must be digits")
  const blob = `${url.pathname}${url.search}${url.hash}`
  const fromProperties = blob.match(/properties\/(\d+)/i)
  if (fromProperties) return fromProperties[1]
  const fromQuery = url.searchParams.get("property")
  if (fromQuery && /^\d+$/.test(fromQuery)) return fromQuery
  const fromPath = blob.match(/\/(?:a\d+)?p(\d+)/)
  if (fromPath) return fromPath[1]
  throw new Error("Account ref must be digits")
}

function normaliseGsc(raw: string): string {
  const text = String(raw ?? "").trim()
  if (!text) throw new Error("Account ref is empty")
  if (text.startsWith("sc-domain:")) {
    if (/^sc-domain:\S+$/.test(text)) return text
    throw new Error("Search Console site must be an sc-domain or a URL")
  }
  if (/^https?:\/\/\S+$/i.test(text)) return text
  throw new Error("Search Console site must be an sc-domain or a URL")
}

export function normaliseAccountRef(platform: string, raw: string): string {
  if (!isPlatformAccountPlatform(platform)) {
    throw new Error("Unknown platform")
  }
  if (platform === "ga4") return normaliseGa4(raw)
  if (platform === "gsc") return normaliseGsc(raw)
  if (platform === "meta_page") {
    // No act_ strip: an act_ value is an ad account, not a page.
    const stripped = String(raw ?? "").trim().replace(/[- ]/g, "")
    if (!/^\d+$/.test(stripped)) {
      throw new Error("Meta page id must be digits")
    }
    return stripped
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
  if (platform === "ga4" && /^\d+$/.test(ref)) {
    return `properties/${ref}`
  }
  return ref
}

export const PLATFORM_ACCOUNT_LABELS: Record<PlatformAccountPlatform, string> = {
  meta_ads: "Meta ads",
  meta_page: "Meta page",
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
  ga4: "Google Analytics 4",
  gsc: "Search Console",
}

export function isAdvertiserNamePlatform(
  platform: string,
): platform is "cm360" | "dv360" {
  return platform === "cm360" || platform === "dv360"
}

/** Snowflake's missing-object error names the view and says it does not exist or is not authorized. */
export function isMissingAdvertiserView(err: unknown): boolean {
  const parts: string[] = []
  let current: unknown = err
  for (let depth = 0; depth < 4 && current; depth++) {
    if (typeof current === "object" && current && "message" in current) {
      parts.push(String((current as { message: unknown }).message))
    } else {
      parts.push(String(current))
    }
    current =
      typeof current === "object" && current && "cause" in current
        ? (current as { cause: unknown }).cause
        : null
  }
  const message = parts.join(" ")
  return /v_platform_advertisers/i.test(message) && /does not exist|not authorized/i.test(message)
}

/** Platforms that are not ad accounts: they never carry delivery. */
export const NON_DELIVERY_PLATFORM_ACCOUNTS: ReadonlySet<string> = new Set(["ga4", "gsc", "meta_page"])

type MetaPageAccountRow = {
  platform: string
  accountRef?: string | null
  active?: boolean | null
}

/**
 * The client's Meta page id for creative avatars and mockups.
 * The first active meta_page platform account wins. With none, falls back to
 * the legacy clients.idmeta value (trimmed, as before) until that data is moved.
 */
export function pickMetaPageId(
  accounts: readonly MetaPageAccountRow[] | null | undefined,
  legacyIdmeta: unknown,
): string {
  for (const row of accounts ?? []) {
    if (row.platform !== "meta_page" || row.active === false) continue
    const ref = String(row.accountRef ?? "").trim()
    if (ref) return ref
  }
  return legacyIdmeta == null ? "" : String(legacyIdmeta).trim()
}
