import type { BillingLineItem, BillingRecord } from "@/lib/types/financeBilling"
import type { ReportLine } from "@/lib/finance/extractReportLinesFromBillingSchedule"
import { classifyBillingAgency } from "@/lib/finance/billingAgency"
import type { ReportRow } from "./types"

const UNSPECIFIED = "Unspecified"

export type PublisherBillingAgencyByName = Map<string, string> | Record<string, string>

export type BuildReportRowsOptions = {
  /** `publisher_name` → raw `publishers.billingagency` from `/api/publishers`. */
  publisherBillingAgencyByName?: PublisherBillingAgencyByName
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

function lookupBillingAgency(
  publisher: string,
  map: PublisherBillingAgencyByName | undefined
): string | null | undefined {
  if (!map || !publisher || publisher === UNSPECIFIED) return undefined
  if (map instanceof Map) return map.get(publisher)
  return map[publisher]
}

function resolveBillingAgency(
  publisher: string,
  map: PublisherBillingAgencyByName | undefined,
  rowKind: ReportRow["rowKind"]
): "AA" | "AM" {
  if (rowKind === "service") return "AM"
  return classifyBillingAgency(lookupBillingAgency(publisher, map))
}

function recordBillingDims(record: BillingRecord): Pick<ReportRow, "billingType" | "billingStatus"> {
  return {
    billingType: record.billing_type,
    billingStatus: record.status,
  }
}

function mediaRowFromReportLine(
  record: BillingRecord,
  line: ReportLine,
  map: PublisherBillingAgencyByName | undefined
): ReportRow {
  const mediaSpend = round2(line.mediaAmount)
  const agencyFee = round2(line.feeAmount)
  const publisher = dimension(line.publisher)
  return {
    mbaNumber: record.mba_number ?? "",
    billingMonth: record.billing_month,
    client: record.client_name,
    mediaType: dimension(line.mediaType),
    publisher,
    buyType: dimension(line.buyType),
    format: dimension(line.format),
    station: dimension(line.station),
    rowKind: "media",
    ...recordBillingDims(record),
    billingAgency: resolveBillingAgency(publisher, map, "media"),
    totalBillable: round2(mediaSpend + agencyFee),
    mediaSpend,
    agencyFee,
    clientPays: line.clientPaysForMedia === true,
  }
}

function mediaRowFromLineItem(
  record: BillingRecord,
  line: BillingLineItem,
  map: PublisherBillingAgencyByName | undefined
): ReportRow {
  const clientPays = line.client_pays_media === true
  const mediaSpend = clientPays ? 0 : round2(line.amount)
  const publisher = dimension(line.publisher_name ?? line.description)
  return {
    mbaNumber: record.mba_number ?? "",
    billingMonth: record.billing_month,
    client: record.client_name,
    mediaType: dimension(line.media_type),
    publisher,
    buyType: UNSPECIFIED,
    format: UNSPECIFIED,
    station: UNSPECIFIED,
    rowKind: "media",
    ...recordBillingDims(record),
    billingAgency: resolveBillingAgency(publisher, map, "media"),
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
    ...recordBillingDims(record),
    billingAgency: "AM",
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
  options: BuildReportRowsOptions = {}
): ReportRow[] {
  const map = options.publisherBillingAgencyByName
  const rows: ReportRow[] = []

  for (const record of records) {
    const reportLines = record.report_lines ?? []
    const hasReportLines = reportLines.length > 0

    if (hasReportLines) {
      for (const line of reportLines) {
        rows.push(mediaRowFromReportLine(record, line, map))
      }
    } else {
      for (const line of record.line_items) {
        if (line.line_type === "media") {
          rows.push(mediaRowFromLineItem(record, line, map))
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
