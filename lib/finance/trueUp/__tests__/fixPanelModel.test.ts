import assert from "node:assert/strict"
import test from "node:test"

import { buildTrueUpReport } from "../compute.js"
import { ledgerLabel, noInvoiceMonthOptions, trueUpPreviewGrid } from "../fixPanelModel.js"
import { INVOICES, MATCHED_RECORDS, PLANS, SCHEDULE } from "./fixtures.js"

test("carry candidates: past months with nothing invoiced and something scheduled", () => {
  const report = buildTrueUpReport({ asOfMonth: "2026-10", fromMonth: "2026-07", plans: PLANS, schedule: SCHEDULE, invoices: INVOICES, matchedRecords: MATCHED_RECORDS })
  const row = report.rows.find((r) => r.mbaNumber === "golf025")!
  const opts = noInvoiceMonthOptions(row, "2026-11")
  assert.ok(opts.every((m) => m < "2026-11"))
  for (const m of opts) assert.equal(row.months.find((x) => x.month === m)!.invoiceNumbers.length, 0)
})

test("preview grid keeps only months that change", () => {
  const z = (m: string) => ({ month: m, before: 0, after: 0 })
  const grid = trueUpPreviewGrid({
    months: [
      { month: "2026-09", fee: { month: "2026-09", before: 100, after: 50 }, adserving: z("2026-09"), media: z("2026-09"), production: z("2026-09") },
      { month: "2026-10", fee: z("2026-10"), adserving: z("2026-10"), media: z("2026-10"), production: z("2026-10") },
    ] as never,
  })
  assert.equal(grid.length, 1)
  assert.equal(grid[0]!.month, "2026-09")
})

test("ledger labels", () => {
  const base = { id: 1, gapCents: -500, amountCents: -500, asOfMonth: "2026-10", billingRevisionId: null, reasonCode: null, note: null, xeroInvoiceId: null, createdAt: "", createdByName: null, months: [], strategy: null }
  assert.equal(ledgerLabel({ ...base, component: "fee", action: "one_off" }), "Fee: charge to raise")
  assert.match(ledgerLabel({ ...base, component: "adserving", action: "explained", reasonCode: "timing" }), /Ad serving: explained, Timing/)
})
