import assert from "node:assert/strict"
import test from "node:test"

import type { MbaMaster } from "../../../xero/matchMba.js"
import {
  matchXeroInvoicesToAppRecords,
  type AppBillingMatchRecord,
  type XeroBillingMatchInvoice,
} from "../xeroBillingMatch.js"

const masters: MbaMaster[] = [{ id: 1, mba_number: "PENFOLD018" }]

function record(partial: Partial<AppBillingMatchRecord> & Pick<AppBillingMatchRecord, "invoiceKey">): AppBillingMatchRecord {
  return {
    clientsId: 7,
    billingType: "media",
    mbaNumber: "PENFOLD018",
    scopeId: null,
    billingMonth: "2026-07",
    approvedAmountCents: 10_000,
    scheduleMonthCents: null,
    legacyBilledCents: null,
    ...partial,
  }
}

function invoice(partial: Partial<XeroBillingMatchInvoice> & Pick<XeroBillingMatchInvoice, "xeroInvoiceId">): XeroBillingMatchInvoice {
  return {
    status: "AUTHORISED",
    issueDate: "2026-07-15",
    referenceRaw: "(PENFOLD018)",
    firstLineDescription: null,
    subTotalCents: 10_000,
    linkedClientId: 7,
    ...partial,
  }
}

test("reference token matches a billing month one month off issue_date, and exact month wins", () => {
  const adjacentOnly = matchXeroInvoicesToAppRecords({
    masters,
    invoices: [invoice({ xeroInvoiceId: "inv-adj" })],
    records: [record({ invoiceKey: "media:PENFOLD018:2026-06", billingMonth: "2026-06" })],
  })
  assert.equal(adjacentOnly[0]?.kind, "stamp")
  if (adjacentOnly[0]?.kind === "stamp") {
    assert.deepEqual(adjacentOnly[0].invoiceKeys, ["media:PENFOLD018:2026-06"])
  }

  const both = matchXeroInvoicesToAppRecords({
    masters,
    invoices: [invoice({ xeroInvoiceId: "inv-exact" })],
    records: [
      record({ invoiceKey: "media:PENFOLD018:2026-06", billingMonth: "2026-06" }),
      record({ invoiceKey: "media:PENFOLD018:2026-07", billingMonth: "2026-07" }),
    ],
  })
  assert.equal(both[0]?.kind, "stamp")
  if (both[0]?.kind === "stamp") {
    assert.deepEqual(both[0].invoiceKeys, ["media:PENFOLD018:2026-07"])
  }
})

test("N app records stamp one Xero invoice when their expected totals sum to sub_total within $1", () => {
  const decisions = matchXeroInvoicesToAppRecords({
    masters,
    invoices: [
      invoice({
        xeroInvoiceId: "inv-sum",
        referenceRaw: "July media",
        subTotalCents: 10_050,
      }),
    ],
    records: [
      record({
        invoiceKey: "media:PENFOLD018:2026-07:a",
        approvedAmountCents: 4_000,
      }),
      record({
        invoiceKey: "media:PENFOLD018:2026-07:b",
        mbaNumber: "OTHER001",
        approvedAmountCents: 6_000,
      }),
    ],
  })
  assert.equal(decisions[0]?.kind, "stamp")
  if (decisions[0]?.kind === "stamp") {
    assert.deepEqual(decisions[0].invoiceKeys, [
      "media:PENFOLD018:2026-07:a",
      "media:PENFOLD018:2026-07:b",
    ])
    assert.equal(decisions[0].drift, "auto_adopted")
    assert.equal(decisions[0].adoptCents, null)
  }
})

test("auto-adopts at $0.99 and leaves Differs at $1.01", () => {
  const row = record({ invoiceKey: "media:PENFOLD018:2026-07" })
  const adoptRun = matchXeroInvoicesToAppRecords({
    masters,
    invoices: [invoice({ xeroInvoiceId: "inv-adopt", subTotalCents: 10_099 })],
    records: [row],
  })
  const differsRun = matchXeroInvoicesToAppRecords({
    masters,
    invoices: [invoice({ xeroInvoiceId: "inv-differs", subTotalCents: 10_101 })],
    records: [row],
  })
  const adopt = adoptRun[0]
  const differs = differsRun[0]
  assert.equal(adopt?.kind, "stamp")
  assert.equal(differs?.kind, "stamp")
  if (adopt?.kind === "stamp") {
    assert.equal(adopt.drift, "auto_adopted")
    assert.equal(adopt.adoptCents, 10_099)
    assert.equal(adopt.expected[0]?.source, "approved_snapshot")
  }
  if (differs?.kind === "stamp") {
    assert.equal(differs.drift, "differs")
    assert.equal(differs.adoptCents, null)
  }
})

test("DELETED unlinks and does not stamp", () => {
  const decisions = matchXeroInvoicesToAppRecords({
    masters,
    invoices: [invoice({ xeroInvoiceId: "inv-dead", status: "DELETED" })],
    records: [record({ invoiceKey: "media:PENFOLD018:2026-07" })],
  })
  assert.equal(decisions.length, 1)
  assert.deepEqual(decisions[0], { kind: "unlink", xeroInvoiceId: "inv-dead", status: "DELETED" })
})
