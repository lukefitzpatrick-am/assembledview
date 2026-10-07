/**
 * One set of delivery rate formulas. CTR and VTR are decimals (0.0123), never
 * percentage points. Multiply by 100 only when formatting. Null when the
 * denominator is missing or the result is not finite.
 */

function finite(value: number): number | null {
  return Number.isFinite(value) ? value : null
}

export function safeRatio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null
  }
  return finite(numerator / denominator)
}

export function cpm(spend: number, impressions: number): number | null {
  const ratio = safeRatio(spend, impressions)
  return ratio == null ? null : finite(ratio * 1000)
}

export function cpc(spend: number, clicks: number): number | null {
  return safeRatio(spend, clicks)
}

export function cpv(spend: number, views: number): number | null {
  return safeRatio(spend, views)
}

export function cpa(spend: number, conversions: number): number | null {
  return safeRatio(spend, conversions)
}

/** Clicks / impressions as a decimal, never ×100. */
export function ctr(clicks: number, impressions: number): number | null {
  return safeRatio(clicks, impressions)
}

/** Views / impressions as a decimal, never ×100. */
export function vtr(views: number, impressions: number): number | null {
  return safeRatio(views, impressions)
}
