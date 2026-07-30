/**
 * Parse Xero UpdatedDateUTC /Date(ms)/ (and DateString YYYY-MM-DD).
 * Xano ingest: substr(6,13) of the /Date(...)/ form → ms epoch.
 */

/** Extract epoch ms from `/Date(1719792000000+0000)/` or `/Date(1719792000000)/`. */
export function parseXeroDotNetDate(raw: unknown): Date | null {
  if (raw == null) return null
  const s = String(raw)
  if (s.length < 19) return null
  // Mirror Xano: substr(6, 13) — characters after "/Date(" for 13 digit ms
  const slice = s.slice(6, 19)
  const ms = Number.parseInt(slice, 10)
  if (!Number.isFinite(ms)) return null
  return new Date(ms)
}

/** YYYY-MM-DD from Xero DateString / DueDateString (first 10 chars). */
export function parseXeroDateString(raw: unknown): string | null {
  if (raw == null) return null
  const s = String(raw).trim()
  if (s.length < 10) return null
  const day = s.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  return day
}
