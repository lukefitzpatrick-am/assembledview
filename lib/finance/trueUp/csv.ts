/**
 * True-up CSV (Stage 1). One row per MBA and month, then a "To date" row per
 * MBA with the status and suggestion for each component, then the
 * unattributed invoice lines. Dollars ex GST, two decimals, no symbol.
 * Sign: invoiced minus scheduled. Plus = credit due, minus = charge due.
 */

import {
  TRUE_UP_COMPONENTS,
  TRUE_UP_COMPONENT_LABELS,
  TRUE_UP_STATUS_LABELS,
  type TrueUpReport,
} from "./compute"

/** Integer cents to "1234.56" without float maths. */
export function centsToPlain(cents: number): string {
  const sign = cents < 0 ? "-" : ""
  const digits = String(Math.abs(Math.trunc(cents))).padStart(3, "0")
  return `${sign}${digits.slice(0, -2)}.${digits.slice(-2)}`
}

function cell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function trueUpCsvHeader(): string[] {
  const head = ["row", "client", "mba", "version", "month", "invoices", "provisional invoices"]
  for (const c of TRUE_UP_COMPONENTS) {
    const label = TRUE_UP_COMPONENT_LABELS[c].toLowerCase()
    head.push(`${label} scheduled`, `${label} invoiced`, `${label} provisional`, `${label} gap`, `${label} status`, `${label} suggestion`)
  }
  head.push("notes")
  return head
}

export function buildTrueUpCsv(report: TrueUpReport): string {
  const lines: string[][] = [trueUpCsvHeader()]
  for (const row of report.rows) {
    const base = [row.clientName, row.mbaNumber, row.versionNumber == null ? "" : String(row.versionNumber)]
    for (const m of row.months) {
      const out = ["month", ...base, m.month, m.invoiceNumbers.join(" "), m.provisionalInvoiceNumbers.join(" ")]
      for (const c of TRUE_UP_COMPONENTS) {
        const cellData = m.components[c]
        out.push(
          centsToPlain(cellData.scheduled),
          centsToPlain(cellData.invoiced),
          centsToPlain(cellData.provisional),
          centsToPlain(cellData.gap),
          "",
          "",
        )
      }
      out.push("")
      lines.push(out)
    }
    const total = ["to date", ...base, `${report.fromMonth} to ${report.asOfMonth}`, "", ""]
    for (const c of TRUE_UP_COMPONENTS) {
      const s = row.components[c]
      total.push(
        centsToPlain(s.scheduledToDate),
        centsToPlain(s.invoicedToDate),
        centsToPlain(s.provisionalToDate),
        centsToPlain(s.gap),
        TRUE_UP_STATUS_LABELS[s.status],
        s.suggestion,
      )
    }
    total.push(row.notes.join("; "))
    lines.push(total)
  }
  for (const u of report.unattributed) {
    const out = ["unattributed", "", "", "", (u.issueDate ?? "").slice(0, 7), u.invoiceNumber, u.state === "provisional" ? u.invoiceNumber : ""]
    for (const c of TRUE_UP_COMPONENTS) {
      const amount = c === u.component ? centsToPlain(u.cents) : ""
      out.push("", u.state === "counted" ? amount : "", u.state === "provisional" ? amount : "", "", "", "")
    }
    out.push(`${u.reason === "no_mba" ? "No MBA found" : "MBA has no published plan"}. Reference: ${u.reference}`)
    lines.push(out)
  }
  return lines.map((l) => l.map(cell).join(",")).join("\r\n") + "\r\n"
}

export function trueUpCsvFilename(asOfMonth: string): string {
  return `true-up-${asOfMonth}.csv`
}
