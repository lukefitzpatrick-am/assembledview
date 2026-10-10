import { parseDateOnlyString, toDateOnlyString, toMelbourneDateString } from "@/lib/timezone"

/** Campaign date fields on the create and edit forms. */
export const DRAFT_CAMPAIGN_DATE_FIELDS = [
  "mp_campaigndates_start",
  "mp_campaigndates_end",
] as const

const YMD = /^\d{4}-\d{2}-\d{2}$/
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}[T ]/

/**
 * Civil day for a draft date.
 * A Date is the local day the picker showed.
 * A UTC ISO string (JSON.stringify of that Date, or server jsonb) is the
 * Australia/Melbourne calendar day of the instant, not the UTC date prefix.
 * A bare YYYY-MM-DD is already a civil day.
 */
export function draftCampaignCivilDay(value: unknown): string | null {
  if (value == null || value === "") return null
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return toDateOnlyString(value)
  }
  if (typeof value !== "string") return String(value)
  const s = value.trim()
  if (!s) return null
  if (YMD.test(s)) return s
  if (ISO_INSTANT.test(s)) {
    try {
      return toMelbourneDateString(s)
    } catch {
      return s
    }
  }
  const parsed = new Date(s)
  if (!Number.isNaN(parsed.getTime())) return toDateOnlyString(parsed)
  return s
}

/** Date the campaign picker can show. Non-dates pass through. */
export function restoreDraftCampaignDate(value: unknown): unknown {
  if (!(value instanceof Date) && typeof value !== "string") return value
  const day = draftCampaignCivilDay(value)
  if (!day || !YMD.test(day)) return value
  try {
    return parseDateOnlyString(day)
  } catch {
    return value
  }
}

/** One restore for create and edit. Other form fields are copied unchanged. */
export function restoreDraftFormValues(
  formValues: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!formValues) return {}
  const next: Record<string, unknown> = { ...formValues }
  for (const key of DRAFT_CAMPAIGN_DATE_FIELDS) {
    if (key in next) next[key] = restoreDraftCampaignDate(next[key])
  }
  return next
}
