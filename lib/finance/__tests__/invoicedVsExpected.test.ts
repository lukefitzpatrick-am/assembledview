import assert from "node:assert/strict"
import test from "node:test"
import ExcelJS from "exceljs"

import { buildInvoicedVsExpectedWorkbook } from "../exportInvoicedVsExpected.js"
import {
  INVOICED_VS_EXPECTED_COLUMNS,
  buildInvoicedVsExpected,
  defaultInvoicedVsExpectedFy,
  formatSignedDelta,
  invoicedVsExpectedFilename,
  type PlanExpectedRow,
  type UnmatchedInvoiceRow,
} from "../invoicedVsExpected.js"

function plan(partial: Partial<PlanExpectedRow> = {}): PlanExpectedRow {
  return {
    invoiceKey: "media:BOSS001:2026-07",
    billingMonth: "2026-07",
    clientName: "Boss",
    clientsId: 7,
    mbaNumber: "BOSS001",
    campaignName: "July",
    billingType: "media",
    approvedAmountCents: null,
    scheduleCents: 150_000,
    billedAmountCents: null,
    matchedXeroInvoiceId: "inv-low",
    xeroMatchResolution: null,
    invoiceNumber: "INV-LOW",
    xeroStatus: "DRAFT",
    subTotalCents: 112_466,
    ...partial,
  }
}

const invoices: UnmatchedInvoiceRow[] = [
  {
    xeroInvoiceId: "inv-orphan",
    invoiceNumber: "INV-ORPHAN",
    status: "AUTHORISED",
    subTotalCents: 50_000,
    issueMonth: "2026-07",
    contactName: "Boss",
    clientId: 7,
  },
]

test("Boss July rows show −375.34 and +454.74", () => {
  const report = buildInvoicedVsExpected({
    fy: "fy27",
    clientId: 7,
    type: "all",
    view: "all",
    invoices,
    plans: [
      plan(),
      plan({
        invoiceKey: "sow:BOSS-SOW:2026-07",
        mbaNumber: "BOSS-SOW",
        billingType: "sow",
        scheduleCents: null,
        billedAmountCents: 80_000,
        matchedXeroInvoiceId: "inv-high",
        invoiceNumber: "INV-HIGH",
        subTotalCents: 125_474,
        xeroStatus: "SUBMITTED",
      }),
      plan({
        invoiceKey: "media:BOSS001:2026-07:b",
        matchedXeroInvoiceId: "inv-close",
        invoiceNumber: "INV-CLOSE",
        scheduleCents: 10_000,
        subTotalCents: 10_050,
      }),
      plan({
        invoiceKey: "media:OTHER:2026-07",
        clientName: "Other",
        clientsId: 9,
        mbaNumber: "OTHER001",
      }),
    ],
  })
  const boss = report.pairs.filter((row) => row.month === "2026-07")
  const notable = boss
    .map((row) => formatSignedDelta(row.deltaCents ?? 0))
    .filter((delta) => delta === "−375.34" || delta === "+454.74")
  assert.equal(notable.length, 2)
  assert.ok(notable.includes("−375.34"))
  assert.ok(notable.includes("+454.74"))
  assert.equal(boss.find((row) => row.invoiceNumber === "INV-LOW")?.source, "schedule")
  assert.equal(boss.find((row) => row.invoiceNumber === "INV-HIGH")?.source, "billed_amount")
  assert.equal(boss.find((row) => row.invoiceNumber === "INV-CLOSE")?.resolution, "agrees")
  assert.equal(report.unmatchedInvoices.length, 1)
  assert.equal(report.unmatchedInvoices[0]?.invoiceNumber, "INV-ORPHAN")
  assert.equal(report.unmatchedMonths.length, 0)
})

test("unmatched sections populate", () => {
  const report = buildInvoicedVsExpected({
    fy: "all",
    clientId: null,
    type: "all",
    view: "differences",
    invoices,
    plans: [
      plan(),
      plan({
        invoiceKey: "retainer:boss:2026-08",
        billingMonth: "2026-08",
        billingType: "retainer",
        mbaNumber: "",
        campaignName: "Retainer",
        matchedXeroInvoiceId: null,
        xeroStatus: null,
        subTotalCents: null,
        invoiceNumber: null,
        scheduleCents: 40_000,
      }),
    ],
  })
  assert.equal(report.unmatchedInvoices.length, 1)
  assert.equal(report.unmatchedMonths.length, 1)
  assert.equal(report.unmatchedMonths[0]?.reference, "Retainer")
  assert.equal(report.rows.length, 1)
  assert.equal(formatSignedDelta(report.rows[0]?.deltaCents ?? 0), "−375.34")
  assert.equal(invoicedVsExpectedFilename("fy27"), "invoiced-vs-expected-fy27.xlsx")
})

test("excel uses the same columns", async () => {
  const report = buildInvoicedVsExpected({
    fy: "fy27",
    clientId: 7,
    type: "all",
    view: "differences",
    invoices,
    plans: [plan()],
  })
  const buffer = await buildInvoicedVsExpectedWorkbook(report.rows)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as never)
  const sheet = workbook.getWorksheet("Invoiced vs expected")
  const headers = (sheet?.getRow(1).values as unknown[]).slice(1)
  assert.deepEqual(headers, [...INVOICED_VS_EXPECTED_COLUMNS])
  const delta = sheet?.getRow(2).getCell(8).value
  assert.equal(typeof delta, "number")
  assert.ok(Math.abs((delta as number) - -375.34) < 0.001)
})

test("default FY is the Melbourne year: FY26 on 30 Jun, FY27 on 1 Jul", () => {
  assert.equal(defaultInvoicedVsExpectedFy(new Date("2026-06-30T13:30:00.000Z")), "fy26")
  assert.equal(defaultInvoicedVsExpectedFy(new Date("2026-06-30T14:30:00.000Z")), "fy27")
})
