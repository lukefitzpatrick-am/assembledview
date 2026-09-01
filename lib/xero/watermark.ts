/**
 * Watermark / resume protocol for xero_sync_log notes JSON.
 * Same as Xano ingest: next_page + watermark_used; contacts uses own keys.
 */

export type InvoiceWatermarkState = {
  watermarkStr: string
  nextPage: number
}

export type ContactsWatermarkState = {
  watermarkStr: string
  nextPage: number
}

const DEFAULT_WATERMARK = "2024-07-01T00:00:00"

export function parseNotesJson(notes: string | null | undefined): Record<string, unknown> {
  if (!notes) return {}
  try {
    const v = JSON.parse(notes) as unknown
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function formatWatermarkTs(raw: string | null | undefined): string | null {
  if (!raw) return null
  // Accept ISO / timestamptz string → Y-m-dTH:i:s (no Z), matching Xano format_timestamp
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null
  const iso = d.toISOString() // 2024-07-01T00:00:00.000Z
  return iso.slice(0, 19)
}

/**
 * Optional If-Modified-Since override for a finance pull (narrow window).
 * Starts page 1 so a 24h pull cannot resume a stale cron `next_page`.
 */
export function invoiceIngestWindow(
  lastLog: {
    notes: string | null
    watermarkUsed: string | null
    newWatermark: string | null
  } | null,
  overrideIfModifiedSince?: string,
): InvoiceWatermarkState & { usedOverride: boolean } {
  const trimmed = overrideIfModifiedSince?.trim()
  if (trimmed) {
    const alreadyCivil = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(trimmed)
    return {
      watermarkStr: alreadyCivil
        ? trimmed
        : (formatWatermarkTs(trimmed) ?? trimmed.slice(0, 19)),
      nextPage: 1,
      usedOverride: true,
    }
  }
  return { ...resumeInvoiceWatermark(lastLog), usedOverride: false }
}

/** Lookback for POST /api/finance/sections/pull-xero — drafts live minutes, not a day. */
export const PULL_XERO_LOOKBACK_HOURS = 24

export function pullXeroIfModifiedSince(now = new Date()): string {
  const ms = PULL_XERO_LOOKBACK_HOURS * 60 * 60 * 1000
  return new Date(now.getTime() - ms).toISOString().slice(0, 19)
}

/**
 * Resume invoices paging from the latest sync log (invoice keys in notes).
 * If notes.next_page present → resume that page with watermark_used.
 * Else → page 1 with new_watermark from last successful completion.
 */
export function resumeInvoiceWatermark(lastLog: {
  notes: string | null
  watermarkUsed: string | null
  newWatermark: string | null
} | null): InvoiceWatermarkState {
  if (!lastLog) {
    return { watermarkStr: DEFAULT_WATERMARK, nextPage: 1 }
  }
  const notes = parseNotesJson(lastLog.notes)
  if (notes.next_page != null) {
    const page = Number(notes.next_page)
    return {
      watermarkStr:
        formatWatermarkTs(lastLog.watermarkUsed) ?? DEFAULT_WATERMARK,
      nextPage: Number.isFinite(page) && page >= 1 ? page : 1,
    }
  }
  return {
    watermarkStr:
      formatWatermarkTs(lastLog.newWatermark) ?? DEFAULT_WATERMARK,
    nextPage: 1,
  }
}

export function resumeContactsWatermark(lastLog: {
  notes: string | null
  watermarkUsed: string | null
  newWatermark: string | null
} | null): ContactsWatermarkState {
  if (!lastLog) {
    return { watermarkStr: DEFAULT_WATERMARK, nextPage: 1 }
  }
  const notes = parseNotesJson(lastLog.notes)
  if (notes.contacts_next_page != null) {
    const page = Number(notes.contacts_next_page)
    const wm =
      typeof notes.contacts_watermark === "string"
        ? notes.contacts_watermark
        : formatWatermarkTs(lastLog.watermarkUsed)
    return {
      watermarkStr: wm ?? DEFAULT_WATERMARK,
      nextPage: Number.isFinite(page) && page >= 1 ? page : 1,
    }
  }
  const wm =
    typeof notes.contacts_new_watermark === "string"
      ? notes.contacts_new_watermark
      : formatWatermarkTs(lastLog.newWatermark)
  return {
    watermarkStr: wm ?? DEFAULT_WATERMARK,
    nextPage: 1,
  }
}

export { DEFAULT_WATERMARK }
