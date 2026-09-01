import { saveAs } from "file-saver"

import type { DraftMatchPayload } from "@/lib/finance/sections/draftMatch"
import type { DraftMatchRow } from "@/lib/finance/sections/draftMatch"
import type { DraftMatchOutcome } from "@/lib/finance/sections/draftMatch"

function dollars(cents: number): number {
  return Math.round(cents) / 100
}

const OUTCOME_ORDER: DraftMatchOutcome[] = ["Differs", "Missing", "Extra", "Agrees"]

function orderedRows(payload: DraftMatchPayload): DraftMatchRow[] {
  return OUTCOME_ORDER.flatMap((outcome) => payload.grouped[outcome])
}

/**
 * Excel artefact of the draft-match difference report for the bookkeeper.
 * Amounts as dollars at the edge. No Xero write. Extra rows stay listed.
 */
export async function exportDraftMatchExcel(
  payload: DraftMatchPayload,
  filename: string
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Draft match")

  sheet.columns = [
    { header: "Outcome", key: "outcome", width: 12 },
    { header: "Client", key: "client", width: 28 },
    { header: "Month", key: "month", width: 10 },
    { header: "Approved (ex-GST)", key: "approved", width: 18 },
    { header: "Xero draft (ex-GST)", key: "xero", width: 18 },
    { header: "Delta (ex-GST)", key: "delta", width: 16 },
    { header: "Invoice keys", key: "keys", width: 36 },
    { header: "Xero invoice #", key: "invoice", width: 20 },
    { header: "Xero invoice id", key: "xeroId", width: 40 },
    { header: "Reference", key: "reference", width: 36 },
  ]

  for (const row of orderedRows(payload)) {
    sheet.addRow({
      outcome: row.outcome,
      client: row.client_name,
      month: row.billing_month,
      approved: dollars(row.approved_amount_cents),
      xero: dollars(row.xero_amount_cents),
      delta: dollars(row.delta_cents),
      keys: row.approved.map((a) => a.invoice_key).join("; "),
      invoice: row.drafts.map((d) => d.invoice_number ?? "").filter(Boolean).join("; "),
      xeroId: row.drafts.map((d) => d.xero_invoice_id).join("; "),
      reference: row.drafts.map((d) => d.reference_raw ?? "").filter(Boolean).join("; "),
    })
  }

  for (const key of ["approved", "xero", "delta"] as const) {
    sheet.getColumn(key).numFmt = "$#,##0.00"
  }

  const summary = workbook.addWorksheet("Summary")
  summary.columns = [
    { header: "Outcome", key: "outcome", width: 12 },
    { header: "Count", key: "count", width: 10 },
  ]
  for (const outcome of OUTCOME_ORDER) {
    summary.addRow({ outcome, count: payload.counts[outcome] })
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  saveAs(blob, filename)
}
