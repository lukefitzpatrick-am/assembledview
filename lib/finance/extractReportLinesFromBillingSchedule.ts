import { matchMonthYear, parseBillingScheduleAmount } from "@/lib/finance/utils"

export interface ReportLine {
  lineItemId: string
  mediaType: string
  publisher?: string
  buyType?: string
  format?: string
  station?: string
  mediaAmount: number
  feeAmount: number
  clientPaysForMedia?: boolean
}

type ScheduleLineItem = {
  lineItemId?: unknown
  line_item_id?: unknown
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

type ScheduleMediaType = {
  mediaType?: unknown
  media_type?: unknown
  type?: unknown
  name?: unknown
  lineItems?: unknown
  line_items?: unknown
}

type ScheduleMonth = {
  monthYear?: unknown
  month_year?: unknown
  month?: unknown
  month_label?: unknown
  mediaTypes?: unknown
  media_types?: unknown
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function present(value: unknown): string {
  if (value === null || value === undefined) return ""
  return String(value).trim()
}

function optionalText(value: unknown): string | undefined {
  const text = present(value)
  return text || undefined
}

function booleanValue(value: unknown): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "string") return value.trim().toLowerCase() === "true"
  return false
}

function scheduleMonths(parsedSchedule: unknown): ScheduleMonth[] {
  if (Array.isArray(parsedSchedule)) return parsedSchedule as ScheduleMonth[]
  if (parsedSchedule && typeof parsedSchedule === "object") {
    const months = (parsedSchedule as { months?: unknown }).months
    if (Array.isArray(months)) return months as ScheduleMonth[]
  }
  return []
}

function monthLabel(month: ScheduleMonth): string {
  return present(month.monthYear ?? month.month_year ?? month.month ?? month.month_label)
}

function monthParts(monthYear: string): { year: number; month: number } | null {
  const match = monthYear.match(/^(\d{4})-(\d{2})/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null
  return { year, month }
}

function findScheduleMonth(parsedSchedule: unknown, monthYear: string): ScheduleMonth | null {
  const months = scheduleMonths(parsedSchedule)
  const parts = monthParts(monthYear)
  if (parts) {
    return months.find((month) => matchMonthYear(monthLabel(month), parts.year, parts.month)) ?? null
  }

  const expected = present(monthYear).toLowerCase()
  return months.find((month) => monthLabel(month).toLowerCase() === expected) ?? null
}

function amount(value: unknown): number {
  return round2(parseBillingScheduleAmount(value as string | number))
}

function hasEnrichedAmounts(line: ScheduleLineItem): boolean {
  return (
    line.mediaAmount !== undefined ||
    line.media_amount !== undefined ||
    line.feeAmount !== undefined ||
    line.fee_amount !== undefined
  )
}

export function extractReportLinesFromBillingSchedule(
  parsedSchedule: unknown,
  monthYear: string
): ReportLine[] {
  const month = findScheduleMonth(parsedSchedule, monthYear)
  if (!month) return []

  const mediaTypes = month.mediaTypes ?? month.media_types
  if (!Array.isArray(mediaTypes)) return []

  const reportLines: ReportLine[] = []

  for (const mediaTypeEntry of mediaTypes as ScheduleMediaType[]) {
    const mediaTypeLabel = present(
      mediaTypeEntry.mediaType ?? mediaTypeEntry.media_type ?? mediaTypeEntry.type ?? mediaTypeEntry.name
    )
    const lineItems = mediaTypeEntry.lineItems ?? mediaTypeEntry.line_items
    if (!Array.isArray(lineItems)) continue

    for (const line of lineItems as ScheduleLineItem[]) {
      if (!hasEnrichedAmounts(line)) continue

      const publisher = optionalText(line.publisher)
      const buyType = optionalText(line.buyType ?? line.buy_type)
      const format = optionalText(line.format)
      const station = optionalText(line.station)
      const clientPaysForMedia = booleanValue(
        line.clientPaysForMedia ?? line.client_pays_for_media
      )

      reportLines.push({
        lineItemId: present(line.lineItemId ?? line.line_item_id),
        mediaType: present(line.mediaType ?? line.media_type) || mediaTypeLabel,
        ...(publisher ? { publisher } : {}),
        ...(buyType ? { buyType } : {}),
        ...(format ? { format } : {}),
        ...(station ? { station } : {}),
        mediaAmount: amount(line.mediaAmount ?? line.media_amount ?? 0),
        feeAmount: amount(line.feeAmount ?? line.fee_amount ?? 0),
        ...(clientPaysForMedia ? { clientPaysForMedia } : {}),
      })
    }
  }

  return reportLines
}
