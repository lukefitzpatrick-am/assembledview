/**
 * Read-side normalisation for tasks.due_date.
 *
 * The column is timestamptz. postgres-js (Drizzle mode "string") returns text
 * such as "2026-08-14 00:00:00+00". The UI treats a missing "T" as a civil
 * date and appends a time, which does not parse. On read, collapse every
 * stored instant to the Australia/Sydney civil date. Writes stay YYYY-MM-DD.
 */

import { sydneyCivilParts } from "./quickAddParse.js"

const BARE_YMD = /^(\d{4})-(\d{2})-(\d{2})$/

const dueFormatter = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  day: "2-digit",
  month: "short",
  year: "numeric",
})

function parseInstant(value: string): Date | null {
  let s = value.includes("T") ? value : value.replace(" ", "T")
  s = s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2")
  s = s.replace(/([+-]\d{2})$/, "$1:00")
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Bare YYYY-MM-DD is returned as-is. Instants become the Sydney civil date. */
export function toSydneyCivilYmd(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (BARE_YMD.test(trimmed)) return trimmed
  const instant = parseInstant(trimmed)
  if (!instant) return null
  return sydneyCivilParts(instant).ymd
}

export function sydneyTodayYmd(now = new Date()): string {
  return sydneyCivilParts(now).ymd
}

export function isOverdueYmd(
  dueYmd: string | null,
  status: string,
  now = new Date()
): boolean {
  return dueYmd !== null && status !== "done" && dueYmd < sydneyTodayYmd(now)
}

export function formatDueYmd(dueYmd: string | null): string {
  if (!dueYmd || !BARE_YMD.test(dueYmd)) return "—"
  const [y, m, d] = dueYmd.split("-").map(Number)
  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  if (Number.isNaN(probe.getTime())) return "—"
  return dueFormatter.format(probe)
}
