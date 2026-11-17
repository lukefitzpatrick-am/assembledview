import { normalizeClientPaysForMedia } from "@/lib/finance/normalizeFields"
import { parseBillingScheduleAmount } from "@/lib/finance/utils"

/** Media $ for a campaign / schedule line item (best-effort across aliases). */
export function lineItemMediaAmount(raw: unknown): number {
  if (raw == null || typeof raw !== "object") return 0
  const li = raw as Record<string, unknown>
  const candidates = [
    li.mediaAmount,
    li.media_amount,
    li.deliveryMediaAmount,
    li.delivery_media_amount,
    li.amount,
    li.budget,
    li.net_media,
    li.netMedia,
    li.gross_media,
    li.grossMedia,
  ]
  for (const c of candidates) {
    if (c === undefined || c === null || c === "") continue
    const n = parseBillingScheduleAmount(c as string | number)
    if (n !== 0) return Math.round(n * 100) / 100
  }
  return 0
}

/**
 * Month ex-GST total from a schedule row (delivery = on-screen MBA month scope).
 * Prefer `totalAmount`; otherwise media + fee + ad serving + production.
 */
export function monthExGstFromScheduleEntry(entry: Record<string, unknown>): number {
  if (entry.totalAmount != null && entry.totalAmount !== "") {
    const fromTotal = parseBillingScheduleAmount(entry.totalAmount as string | number)
    if (fromTotal !== 0) return Math.round(fromTotal * 100) / 100
  }
  const media = parseBillingScheduleAmount((entry.mediaTotal as string | number) ?? 0)
  const fee = parseBillingScheduleAmount((entry.feeTotal as string | number) ?? 0)
  const ads = parseBillingScheduleAmount((entry.adservingTechFees as string | number) ?? 0)
  const prod = parseBillingScheduleAmount((entry.production as string | number) ?? 0)
  return Math.round((media + fee + ads + prod) * 100) / 100
}

function scheduleMonthLineItems(month: Record<string, unknown>): unknown[] {
  const out: unknown[] = []
  const mediaTypes = Array.isArray(month.mediaTypes)
    ? month.mediaTypes
    : Array.isArray(month.media_types)
      ? month.media_types
      : []
  for (const mt of mediaTypes) {
    if (mt == null || typeof mt !== "object") continue
    const rec = mt as Record<string, unknown>
    const items = Array.isArray(rec.lineItems)
      ? rec.lineItems
      : Array.isArray(rec.line_items)
        ? rec.line_items
        : []
    out.push(...items)
  }
  const flat = Array.isArray(month.lineItems)
    ? month.lineItems
    : Array.isArray(month.line_items)
      ? month.line_items
      : []
  out.push(...flat)
  return out
}

/** Client-pays media nested on schedule month rows (delivery JSON on the version). */
export function sumClientPaysForMediaMediaFromScheduleMonths(
  months: Record<string, unknown>[]
): number {
  let sum = 0
  for (const month of months) {
    for (const row of scheduleMonthLineItems(month)) {
      if (!normalizeClientPaysForMedia(row)) continue
      sum += lineItemMediaAmount(row)
    }
  }
  return Math.round(sum * 100) / 100
}
