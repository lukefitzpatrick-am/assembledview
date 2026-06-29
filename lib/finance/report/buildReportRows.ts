import { getMediaTypeHeadersForSchedule } from "@/lib/billing/mediaTypeHeaders"
import type { BillingRecord } from "@/lib/types/financeBilling"
import {
  getMediaTypeKeyFromDisplayName,
  matchMonthYear,
  parseBillingScheduleAmount,
} from "@/lib/finance/utils"
import type { ReportRow } from "./types"

const UNSPECIFIED = "Unspecified"

type ScheduleLookup = Map<string, unknown> | Record<string, unknown>

interface ScheduleLineItem {
  lineItemId?: unknown
  line_item_id?: unknown
  header1?: unknown
  header2?: unknown
  amount?: unknown
  mediaType?: unknown
  media_type?: unknown
  publisher?: unknown
  buyType?: unknown
  buy_type?: unknown
  format?: unknown
  station?: unknown
  mediaAmount?: unknown
  media_amount?: unknown
  feeAmount?: unknown
  fee_amount?: unknown
  clientPaysForMedia?: unknown
  client_pays_for_media?: unknown
}

interface ScheduleMediaType {
  mediaType?: unknown
  media_type?: unknown
  type?: unknown
  name?: unknown
  lineItems?: unknown
  line_items?: unknown
}

interface ScheduleMonth {
  monthYear?: unknown
  month_year?: unknown
  month?: unknown
  month_label?: unknown
  mediaTypes?: unknown
  media_types?: unknown
  adservingTechFees?: unknown
  adserving_tech_fees?: unknown
  ad_serving?: unknown
  production?: unknown
  production_cost?: unknown
  productionCost?: unknown
  feeTotal?: unknown
  fee_total?: unknown
  assembledFee?: unknown
}

interface MediaScheduleLine {
  mediaType: string
  mediaKey: string
  line: ScheduleLineItem
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function present(value: unknown): string {
  if (value === null || value === undefined) return ""
  return String(value).trim()
}

function dimension(value: unknown): string {
  const text = present(value)
  return text || UNSPECIFIED
}

function booleanValue(value: unknown): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "string") return value.trim().toLowerCase() === "true"
  return false
}

function billingMonthParts(billingMonth: string): { year: number; month: number } | null {
  const match = billingMonth.match(/^(\d{4})-(\d{2})/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null
  return { year, month }
}

function scheduleForRecord(record: BillingRecord, schedules?: ScheduleLookup): unknown {
  if (!schedules) return null
  const mba = record.mba_number ?? ""
  if (schedules instanceof Map) {
    return schedules.get(mba) ?? null
  }
  return schedules[mba] ?? null
}

function scheduleMonths(schedule: unknown): ScheduleMonth[] {
  if (Array.isArray(schedule)) return schedule as ScheduleMonth[]
  if (schedule && typeof schedule === "object") {
    const months = (schedule as { months?: unknown }).months
    if (Array.isArray(months)) return months as ScheduleMonth[]
  }
  return []
}

function monthLabel(month: ScheduleMonth): string {
  return present(month.monthYear ?? month.month_year ?? month.month ?? month.month_label)
}

function findScheduleMonth(schedule: unknown, billingMonth: string): ScheduleMonth | null {
  const parts = billingMonthParts(billingMonth)
  if (!parts) return null
  return (
    scheduleMonths(schedule).find((month) => matchMonthYear(monthLabel(month), parts.year, parts.month)) ??
    null
  )
}

function mediaTypeLabel(entry: ScheduleMediaType): string {
  return dimension(entry.mediaType ?? entry.media_type ?? entry.type ?? entry.name)
}

function mediaTypeKey(label: string): string {
  const key = getMediaTypeKeyFromDisplayName(label)
  if (key === "digitalDisplay") return "digiDisplay"
  if (key === "digitalAudio") return "digiAudio"
  if (key === "digitalVideo") return "digiVideo"
  return key
}

function mediaLinesForMonth(month: ScheduleMonth | null): MediaScheduleLine[] {
  if (!month) return []
  const mediaTypes = month.mediaTypes ?? month.media_types
  if (!Array.isArray(mediaTypes)) return []

  const lines: MediaScheduleLine[] = []
  for (const mediaTypeEntry of mediaTypes as ScheduleMediaType[]) {
    const label = mediaTypeLabel(mediaTypeEntry)
    const key = mediaTypeKey(label)
    const lineItems = mediaTypeEntry.lineItems ?? mediaTypeEntry.line_items
    if (!Array.isArray(lineItems)) continue
    for (const line of lineItems as ScheduleLineItem[]) {
      lines.push({ mediaType: label, mediaKey: key, line })
    }
  }
  return lines
}

function hasEnrichedAmounts(lines: MediaScheduleLine[]): boolean {
  return lines.some(
    ({ line }) =>
      line.mediaAmount !== undefined ||
      line.media_amount !== undefined ||
      line.feeAmount !== undefined ||
      line.fee_amount !== undefined
  )
}

function amount(value: unknown): number {
  return round2(parseBillingScheduleAmount(value as string | number))
}

function legacyPublisher(line: ScheduleLineItem, mediaKey: string): string {
  const headers = getMediaTypeHeadersForSchedule(mediaKey)
  return headers.header1 ? dimension(line.header1 ?? line.header2) : dimension(line.header2)
}

function mediaRowFromLine(
  record: BillingRecord,
  scheduleLine: MediaScheduleLine,
  enriched: boolean
): ReportRow {
  const { line } = scheduleLine
  const clientPays = booleanValue(line.clientPaysForMedia ?? line.client_pays_for_media)
  const mediaSpend = enriched
    ? amount(line.mediaAmount ?? line.media_amount ?? 0)
    : clientPays
      ? 0
      : amount(line.amount ?? 0)
  const agencyFee = enriched ? amount(line.feeAmount ?? line.fee_amount ?? 0) : 0

  return {
    mbaNumber: record.mba_number ?? "",
    billingMonth: record.billing_month,
    client: record.client_name,
    mediaType: dimension(line.mediaType ?? line.media_type ?? scheduleLine.mediaType),
    publisher: enriched ? dimension(line.publisher ?? line.header1) : legacyPublisher(line, scheduleLine.mediaKey),
    buyType: enriched ? dimension(line.buyType ?? line.buy_type) : UNSPECIFIED,
    format: enriched ? dimension(line.format) : UNSPECIFIED,
    station: enriched ? dimension(line.station) : UNSPECIFIED,
    rowKind: "media",
    totalBillable: round2(mediaSpend + agencyFee),
    mediaSpend,
    agencyFee,
    clientPays,
  }
}

function serviceAmount(month: ScheduleMonth | null, keys: Array<keyof ScheduleMonth>): number {
  if (!month) return 0
  for (const key of keys) {
    const value = month[key]
    if (value !== undefined && value !== null) return amount(value)
  }
  return 0
}

function serviceRow(
  record: BillingRecord,
  serviceType: string,
  mediaType: string,
  totalBillable: number
): ReportRow | null {
  if (totalBillable <= 0) return null
  return {
    mbaNumber: record.mba_number ?? "",
    billingMonth: record.billing_month,
    client: record.client_name,
    mediaType,
    publisher: UNSPECIFIED,
    buyType: UNSPECIFIED,
    format: UNSPECIFIED,
    station: UNSPECIFIED,
    rowKind: "service",
    serviceType,
    totalBillable: round2(totalBillable),
    mediaSpend: 0,
    agencyFee: 0,
    clientPays: false,
  }
}

function serviceRowsForRecord(
  record: BillingRecord,
  month: ScheduleMonth | null,
  enriched: boolean
): ReportRow[] {
  const rows = [
    serviceRow(
      record,
      "adServing",
      "Ad Serving",
      serviceAmount(month, ["adservingTechFees", "adserving_tech_fees", "ad_serving"])
    ),
    serviceRow(
      record,
      "production",
      "Production",
      serviceAmount(month, ["production", "production_cost", "productionCost"])
    ),
  ].filter((row): row is ReportRow => row !== null)

  if (!enriched) {
    // Legacy schedules do not persist per-line `feeAmount`, so the month fee is visible as
    // a degraded service-style row instead of being silently spread across media rows.
    const agencyFee = serviceRow(
      record,
      "agencyFee",
      "Agency Fee",
      serviceAmount(month, ["feeTotal", "fee_total", "assembledFee"])
    )
    if (agencyFee) rows.push(agencyFee)
  }

  return rows
}

export function buildReportRows(
  records: BillingRecord[],
  schedulesByMba?: ScheduleLookup
): ReportRow[] {
  const rows: ReportRow[] = []

  for (const record of records) {
    const month = findScheduleMonth(scheduleForRecord(record, schedulesByMba), record.billing_month)
    const mediaLines = mediaLinesForMonth(month)
    const enriched = hasEnrichedAmounts(mediaLines)

    for (const line of mediaLines) {
      rows.push(mediaRowFromLine(record, line, enriched))
    }

    rows.push(...serviceRowsForRecord(record, month, enriched))
  }

  return rows
}
