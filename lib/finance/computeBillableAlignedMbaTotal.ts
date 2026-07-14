import { MEDIA_PLAN_VERSION_LINE_ITEM_TABLE_KEYS } from "@/lib/finance/planLineItemEnrichment"
import { normalizeClientPaysForMedia } from "@/lib/finance/normalizeFields"
import { parseBillingScheduleAmount } from "@/lib/finance/utils"

function tableKeyToCamelProperty(tableKey: string): string {
  return tableKey.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

function lineItemsArrayOnVersion(version: Record<string, unknown>, tableKey: string): unknown[] {
  const camel = tableKeyToCamelProperty(tableKey)
  const raw = version[tableKey] ?? version[camel]
  return Array.isArray(raw) ? raw : []
}

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

/**
 * Sum of media on campaign line items where the client pays for media directly
 * (agency invoices fee only). Flag via {@link normalizeClientPaysForMedia}.
 *
 * Prefers hydrated `*_line_items` on the version; when those are absent (list
 * payloads often omit related rows), falls back to client-pays lines nested on
 * the delivery schedule months.
 */
export function sumClientPaysForMediaMediaFromVersion(
  version: Record<string, unknown>,
  deliveryMonths: Record<string, unknown>[] = []
): number {
  let sum = 0
  let sawAnyChannelRows = false
  for (const tableKey of MEDIA_PLAN_VERSION_LINE_ITEM_TABLE_KEYS) {
    const rows = lineItemsArrayOnVersion(version, tableKey)
    if (rows.length > 0) sawAnyChannelRows = true
    for (const row of rows) {
      if (!normalizeClientPaysForMedia(row)) continue
      sum += lineItemMediaAmount(row)
    }
  }
  sum = Math.round(sum * 100) / 100
  if (sawAnyChannelRows || deliveryMonths.length === 0) return sum
  return sumClientPaysForMediaMediaFromScheduleMonths(deliveryMonths)
}

export type ComputeBillableAlignedMbaTotalInput = {
  deliveryMonths: Record<string, unknown>[]
  billingMonths: Record<string, unknown>[]
  /** Media plan version — used for client-pays media subtraction when delivery is present. */
  version: Record<string, unknown>
}

/**
 * MBA ex-GST total on the **same basis as billing** (client-pays = fee only).
 *
 * Prefer delivery-schedule month totals, then subtract campaign client-pays media
 * so delivery's planned media does not inflate the billable≠MBA gate.
 * When delivery is empty, fall back to billing-schedule headers (already fee-only
 * for client-pays lines — no further subtraction).
 */
export function computeBillableAlignedMbaTotalExGst(
  input: ComputeBillableAlignedMbaTotalInput
): number {
  const { deliveryMonths, billingMonths, version } = input

  if (deliveryMonths.length > 0) {
    const deliveryTotal =
      Math.round(
        deliveryMonths.reduce((sum, entry) => sum + monthExGstFromScheduleEntry(entry), 0) * 100
      ) / 100
    const clientPaysMedia = sumClientPaysForMediaMediaFromVersion(version, deliveryMonths)
    return Math.round((deliveryTotal - clientPaysMedia) * 100) / 100
  }

  return (
    Math.round(
      billingMonths.reduce((sum, entry) => sum + monthExGstFromScheduleEntry(entry), 0) * 100
    ) / 100
  )
}
