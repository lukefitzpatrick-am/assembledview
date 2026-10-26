/**
 * Invoice line descriptions for scope-of-work and retainer rows.
 *
 * Agreed rule (FB-8): the project name plus the billing month and year,
 * for example "SEO retainer, October 2026". Retainers use
 * "Monthly retainer, October 2026".
 *
 * Month names are fixed English names so the label never depends on the
 * runtime locale or time zone.
 */

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const

export const SCOPE_DESCRIPTION_FALLBACK_NAME = "Scope of Work"
export const RETAINER_DESCRIPTION_PREFIX = "Monthly retainer"

/** "October 2026" for (2026, 10). Empty string when the month is out of range. */
export function billingMonthLabel(year: number, month: number): string {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return ""
  return `${MONTH_NAMES[month - 1]} ${year}`
}

/** "October 2026" for "2026-10". Empty string when the key does not parse. */
export function billingMonthKeyLabel(billingMonth: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})$/.exec(String(billingMonth ?? "").trim())
  if (!m) return ""
  return billingMonthLabel(Number(m[1]), Number(m[2]))
}

function withMonth(name: string, year: number, month: number): string {
  const label = billingMonthLabel(year, month)
  return label ? `${name}, ${label}` : name
}

/** Scope row description: "<project name>, <Month YYYY>". */
export function scopeInvoiceDescription(
  projectName: string | null | undefined,
  year: number,
  month: number
): string {
  const name = String(projectName ?? "").trim() || SCOPE_DESCRIPTION_FALLBACK_NAME
  return withMonth(name, year, month)
}

/** Retainer row description: "Monthly retainer, <Month YYYY>". */
export function retainerInvoiceDescription(year: number, month: number): string {
  return withMonth(RETAINER_DESCRIPTION_PREFIX, year, month)
}

/** Retainer description from a "YYYY-MM" key. Falls back to "Monthly retainer". */
export function retainerInvoiceDescriptionForMonthKey(billingMonth: string | null | undefined): string {
  const label = billingMonthKeyLabel(billingMonth)
  return label ? `${RETAINER_DESCRIPTION_PREFIX}, ${label}` : RETAINER_DESCRIPTION_PREFIX
}
