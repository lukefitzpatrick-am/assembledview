/**
 * URL `startDate`/`endDate` (yyyy-mm-dd) → campaign-clamped effective window.
 * Invalid values are rejected (null), not coerced.
 */

export function parseIsoDateOnlyStrict(value?: string | null): string | null {
  if (value == null) return null
  const trimmed = String(value).trim()
  if (!trimmed) return null
  const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const d = new Date(year, month - 1, day)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null
  return trimmed
}

export function clampIsoDateOnly(
  value: string | null | undefined,
  min: string | null,
  max: string | null,
): string | null {
  if (!value) return null
  const iso = parseIsoDateOnlyStrict(value) ?? null
  if (!iso) return null
  if (min && iso < min) return min
  if (max && iso > max) return max
  return iso
}

export function computeEffectiveDateRange(opts: {
  campaignStartISO: string | null
  campaignEndISO: string | null
  requestedStartISO: string | null
  requestedEndISO: string | null
}): { startISO: string | null; endISO: string | null } {
  const { campaignStartISO, campaignEndISO, requestedStartISO, requestedEndISO } = opts

  const startClamped =
    clampIsoDateOnly(requestedStartISO, campaignStartISO, campaignEndISO) ?? campaignStartISO
  const endClamped =
    clampIsoDateOnly(requestedEndISO, campaignStartISO, campaignEndISO) ?? campaignEndISO

  if (startClamped && endClamped && startClamped > endClamped) {
    return { startISO: endClamped, endISO: startClamped }
  }

  return { startISO: startClamped, endISO: endClamped }
}

/** True when the URL has no usable dates, or the clamped window is the full campaign. */
export function isUnfilteredCampaignRange(
  requestedStartISO: string | null,
  requestedEndISO: string | null,
  campaignStartISO: string | null,
  campaignEndISO: string | null,
): boolean {
  if (!requestedStartISO && !requestedEndISO) return true
  if (!campaignStartISO || !campaignEndISO) return true
  const { startISO, endISO } = computeEffectiveDateRange({
    campaignStartISO,
    campaignEndISO,
    requestedStartISO,
    requestedEndISO,
  })
  return startISO === campaignStartISO && endISO === campaignEndISO
}

export function isoToYearMonth(iso: string | null | undefined): string | null {
  const parsed = parseIsoDateOnlyStrict(iso ?? null)
  return parsed ? parsed.slice(0, 7) : null
}
