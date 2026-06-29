import type { BillingLineItem, BillingRecord } from "@/lib/types/financeBilling"
import type { ReportLine } from "@/lib/finance/extractReportLinesFromBillingSchedule"
import type { ReportRow } from "./types"

const UNSPECIFIED = "Unspecified"

type ScheduleLookup = Map<string, unknown> | Record<string, unknown>

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

function mediaRowFromReportLine(record: BillingRecord, line: ReportLine): ReportRow {
  const mediaSpend = round2(line.mediaAmount)
  const agencyFee = round2(line.feeAmount)
  return {
    mbaNumber: record.mba_number ?? "",
    billingMonth: record.billing_month,
    client: record.client_name,
    mediaType: dimension(line.mediaType),
    publisher: dimension(line.publisher),
    buyType: dimension(line.buyType),
    format: dimension(line.format),
    station: dimension(line.station),
    rowKind: "media",
    totalBillable: round2(mediaSpend + agencyFee),
    mediaSpend,
    agencyFee,
    clientPays: line.clientPaysForMedia === true,
  }
}

function mediaRowFromLineItem(record: BillingRecord, line: BillingLineItem): ReportRow {
  const clientPays = line.client_pays_media === true
  const mediaSpend = clientPays ? 0 : round2(line.amount)
  return {
    mbaNumber: record.mba_number ?? "",
    billingMonth: record.billing_month,
    client: record.client_name,
    mediaType: dimension(line.media_type),
    publisher: dimension(line.publisher_name ?? line.description),
    buyType: UNSPECIFIED,
    format: UNSPECIFIED,
    station: UNSPECIFIED,
    rowKind: "media",
    totalBillable: mediaSpend,
    mediaSpend,
    agencyFee: 0,
    clientPays,
  }
}

function serviceRow(
  record: BillingRecord,
  serviceType: string,
  mediaType: string,
  totalBillable: number,
  agencyFee = 0
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
    agencyFee: round2(agencyFee),
    clientPays: false,
  }
}

function serviceRowFromLineItem(
  record: BillingRecord,
  line: BillingLineItem,
  hasReportLines: boolean
): ReportRow | null {
  if (line.line_type !== "service") return null
  if (line.item_code === "T.Adserving") {
    return serviceRow(record, "adServing", "Ad Serving", line.amount)
  }
  if (line.item_code === "Production") {
    return serviceRow(record, "production", "Production", line.amount)
  }
  if (!hasReportLines && line.item_code === "Service") {
    return serviceRow(record, "agencyFee", "Agency Fee", line.amount, line.amount)
  }
  return null
}

export function buildReportRows(
  records: BillingRecord[],
  schedulesByMba?: ScheduleLookup
): ReportRow[] {
  const rows: ReportRow[] = []

  for (const record of records) {
    const reportLines = record.report_lines ?? []
    const hasReportLines = reportLines.length > 0

    if (hasReportLines) {
      for (const line of reportLines) {
        rows.push(mediaRowFromReportLine(record, line))
      }
    } else {
      for (const line of record.line_items) {
        if (line.line_type === "media") {
          rows.push(mediaRowFromLineItem(record, line))
        }
      }
    }

    for (const line of record.line_items) {
      const row = serviceRowFromLineItem(record, line, hasReportLines)
      if (row) rows.push(row)
    }
  }

  return rows
}
