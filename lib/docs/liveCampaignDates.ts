/**
 * Live campaign dates for POST /api/mba/generate.
 * Independent of Partial MBA overlay (MBA-LIVE-2) — a full MBA may carry them.
 */

import { format, parseISO } from "date-fns"

import { normalizeDateToMelbourneISO } from "@/lib/dates/normalizeCampaignDateISO"

export type LiveCampaignDates = { start: string; end: string }

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function formatDateDdMmYyyy(raw: unknown): string {
  if (raw == null || raw === "") return ""
  const s = String(raw).trim()
  try {
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return format(parseISO(s.slice(0, 10)), "dd/MM/yyyy")
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) return format(d, "dd/MM/yyyy")
  } catch {
    /* fall through */
  }
  return s
}

/** Form dates vs persisted row, both via Melbourne ISO. Undefined = do not POST. */
export function liveCampaignDatesIfChanged(args: {
  formStart: unknown
  formEnd: unknown
  persistedStart: unknown
  persistedEnd: unknown
}): LiveCampaignDates | undefined {
  const start = normalizeDateToMelbourneISO(args.formStart)
  const end = normalizeDateToMelbourneISO(args.formEnd)
  if (!start || !end) return undefined
  const persistedStart = normalizeDateToMelbourneISO(args.persistedStart)
  const persistedEnd = normalizeDateToMelbourneISO(args.persistedEnd)
  if (start === persistedStart && end === persistedEnd) return undefined
  return { start, end }
}

export function parseLiveCampaignDates(
  raw: Record<string, unknown>
): LiveCampaignDates | undefined | "invalid" {
  if (!Object.prototype.hasOwnProperty.call(raw, "liveCampaignDates")) {
    return undefined
  }
  const value = raw.liveCampaignDates
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "invalid"
  }
  const obj = value as Record<string, unknown>
  const extra = Object.keys(obj).filter((k) => k !== "start" && k !== "end")
  if (extra.length > 0) return "invalid"
  const start = obj.start
  const end = obj.end
  if (typeof start !== "string" || typeof end !== "string") return "invalid"
  if (!ISO_DATE.test(start) || !ISO_DATE.test(end)) return "invalid"
  return { start, end }
}

export function mbaCampaignDateFields(args: {
  persistedStart: unknown
  persistedEnd: unknown
  liveCampaignDates?: LiveCampaignDates | null
}): { date_start: string; date_end: string; datesUnsaved: boolean } {
  const live = args.liveCampaignDates
  if (live) {
    return {
      date_start: formatDateDdMmYyyy(live.start),
      date_end: formatDateDdMmYyyy(live.end),
      datesUnsaved: true,
    }
  }
  return {
    date_start: formatDateDdMmYyyy(args.persistedStart),
    date_end: formatDateDdMmYyyy(args.persistedEnd),
    datesUnsaved: false,
  }
}
