/**
 * Convert finance ISO month (`2026-05`) to schedule `monthYear` label (`May 2026`).
 * Schedule labels use English long month + year (en-US), matching persisted billing JSON.
 */
export function billingMonthIsoToScheduleLabel(iso: string): string | null {
  const match = /^(\d{4})-(\d{2})$/.exec(iso.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isFinite(year) || month < 1 || month > 12) return null
  const d = new Date(Date.UTC(year, month - 1, 1))
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
}
