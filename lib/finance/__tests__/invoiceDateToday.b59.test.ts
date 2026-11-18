/**
 * B59 (C-277, S9 A): a billing row with no invoice date and no billing month
 * is dated the Melbourne day, never the UTC day. The receivables workbook and
 * the invoice-lines CSV run on the server (send to accounts) and in the
 * browser (the invoicing review download), so this file runs in both zones.
 * The clock is mocked where the UTC day is the day before:
 *   - 30 Nov 2026 21:00Z, 1 Dec 08:00 AEDT;
 *   - 30 Jun 2026 21:00Z, 1 Jul 07:00 AEST.
 */
import "@/lib/testing/bothZones"
import assert from "node:assert/strict"
import test from "node:test"

import ExcelJS from "exceljs"

import { billingRecordsToFinanceCampaigns, invoiceIsoForRecord } from "@/lib/finance/billingRecordToCampaignData"
import { buildReceivablesWorkbookBytes } from "@/lib/finance/exportFinanceHub"
import type { BillingRecord } from "@/lib/types/financeBilling"

const INSTANTS = [
  { at: "2026-11-30T21:00:00Z", day: "2026-12-01", shown: "01/12/2026", label: "1 Dec 08:00 AEDT" },
  { at: "2026-06-30T21:00:00Z", day: "2026-07-01", shown: "01/07/2026", label: "1 Jul 07:00 AEST" },
] as const

function record(over: Partial<BillingRecord>): BillingRecord {
  return {
    id: 1,
    billing_type: "media",
    clients_id: 7,
    client_name: "Client A",
    mba_number: "CLIA001",
    campaign_name: "Summer",
    po_number: null,
    billing_month: "",
    invoice_date: null,
    payment_days: 30,
    payment_terms: "Net 30 days",
    status: "draft",
    line_items: [],
    total: 100,
    has_pending_edits: false,
    source_billing_schedule_id: null,
    ...over,
  } as BillingRecord
}

for (const { at, day, shown, label } of INSTANTS) {
  test(`invoiceIsoForRecord: no invoice date and no month is the Melbourne day (${label})`, (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.parse(at) })
    assert.equal(invoiceIsoForRecord({ invoice_date: null, billing_month: "" }), day)
    assert.equal(invoiceIsoForRecord({ invoice_date: "  ", billing_month: "" }), day)
    assert.equal(invoiceIsoForRecord({ invoice_date: null, billing_month: "2026-10" }), "2026-10-01")
    assert.equal(invoiceIsoForRecord({ invoice_date: " 2026-10-15 ", billing_month: "2026-10" }), "2026-10-15")
  })

  test(`media and scopes workbook campaigns: the fallback invoice date is the Melbourne day (${label})`, (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.parse(at) })
    const [campaign] = billingRecordsToFinanceCampaigns([record({})])
    assert.equal(campaign!.invoiceDate, day)
  })

  test(`retainer sheet: the fallback invoice date is the Melbourne day (${label})`, async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.parse(at) })
    const bytes = await buildReceivablesWorkbookBytes(
      [record({ billing_type: "retainer", status: "approved" as BillingRecord["status"], state: "approved" as BillingRecord["state"] })],
      new Map(),
      { review: true },
    )
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(bytes)
    const cells: string[] = []
    wb.worksheets[0]!.eachRow((row) => {
      row.eachCell((cell) => {
        if (typeof cell.value === "string") cells.push(cell.value)
      })
    })
    assert.ok(cells.includes(shown), `invoice date ${shown} in ${cells.join(" | ")}`)
  })
}
