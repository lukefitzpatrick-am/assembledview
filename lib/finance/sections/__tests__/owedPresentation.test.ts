import assert from "node:assert/strict"
import test from "node:test"

import { dollarsToCents } from "@/lib/xero/money"
import { buildOwedLedger, type OwedSourceInvoice } from "../owedLedger.js"
import { owedPrimaryAction, sortOwedLedgerRows } from "../owedPresentation.js"

const TODAY = "2026-09-01"

function inv(partial: Partial<OwedSourceInvoice> & Pick<OwedSourceInvoice, "id">): OwedSourceInvoice {
  return {
    invoiceNumber: `INV-${partial.id}`,
    reference: null,
    issueDate: "2026-08-01",
    dueDate: "2026-09-15",
    status: "AUTHORISED",
    subTotal: 100,
    totalIncGst: 110,
    amountPaid: 0,
    amountDue: 110,
    fullyPaidDate: null,
    pdfAvailable: false,
    resolved: true,
    clientsId: 1,
    clientName: "Acme",
    contactName: "Acme Pty Ltd",
    ...partial,
  }
}

test("Owed has no primary action for any billing state", () => {
  for (const state of [
    "ready",
    "approved",
    "sent_to_finance",
    "drafted",
    "issued",
    "paid",
    "overdue",
  ] as const) {
    assert.equal(owedPrimaryAction(state), null)
  }
})

test("sorting by Outstanding is unaffected", () => {
  const ledger = buildOwedLedger(
    [
      inv({ id: "small", subTotal: 10, amountDue: 11, dueDate: TODAY }),
      inv({ id: "big", subTotal: 90, amountDue: 99, dueDate: TODAY }),
      inv({ id: "mid", subTotal: 40, amountDue: 44, dueDate: TODAY }),
    ],
    { todayYmd: TODAY }
  )
  assert.equal(ledger.rows.length, 3)

  const desc = sortOwedLedgerRows(ledger.rows, "outstanding", "desc")
  assert.deepEqual(
    desc.map((r) => r.outstandingCents),
    [dollarsToCents(90), dollarsToCents(40), dollarsToCents(10)]
  )
  assert.equal(desc[0]!.invoiceNumber, "INV-big")

  const asc = sortOwedLedgerRows(ledger.rows, "outstanding", "asc")
  assert.deepEqual(
    asc.map((r) => r.outstandingCents),
    [dollarsToCents(10), dollarsToCents(40), dollarsToCents(90)]
  )
})
