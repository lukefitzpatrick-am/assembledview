/**
 * Tracking IDs found in page HTML (Site Watch brief 5.3). One file, so the
 * patterns can be tuned in one place. A pattern with a capture group records
 * the group, otherwise the whole match.
 */
const TRACKING_PATTERNS = {
  gtm: /\bGTM-[A-Z0-9]{4,10}\b/g,
  ga4: /\bG-[A-Z0-9]{8,12}\b/g,
  google_ads: /\bAW-\d{6,12}\b/g,
  universal_analytics: /\bUA-\d{4,12}-\d{1,3}\b/g,
  meta_pixel: /fbq\(\s*['"]init['"]\s*,\s*['"](\d{6,20})['"]/g,
  tiktok_pixel: /ttq\.load\(\s*['"]([A-Z0-9]{10,30})['"]/g,
  linkedin_partner: /_linkedin_partner_id\s*=\s*['"]?(\d{4,12})/g,
  hotjar: /hjid\s*:\s*(\d{4,12})/g,
  klaviyo: /klaviyo\.com\/onsite\/js\/[^"']*company_id=([A-Za-z0-9]{4,10})/g,
} as const

export type TrackingKind = keyof typeof TRACKING_PATTERNS

/** Sorted unique IDs per kind; kinds with none are left out. */
export function findTrackingIds(text: string): Partial<Record<TrackingKind, string[]>> {
  const out: Partial<Record<TrackingKind, string[]>> = {}
  for (const [kind, re] of Object.entries(TRACKING_PATTERNS) as [TrackingKind, RegExp][]) {
    const ids = [...new Set([...text.matchAll(re)].map((m) => m[1] ?? m[0]))].sort()
    if (ids.length) out[kind] = ids
  }
  return out
}
