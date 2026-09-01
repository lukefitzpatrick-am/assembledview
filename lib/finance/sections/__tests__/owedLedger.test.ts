import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { dollarsToCents } from "@/lib/xero/money"
import {
  OWED_UNRESOLVED_CLIENT_LABEL,
  bucketForDaysOverdue,
  buildOwedLedger,
  daysOverdue,
  isLiveOutstandingAr,
  type OwedSourceInvoice,
} from "../owedLedger"

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

describe("owed ageing boundaries", () => {
  it("due today is not yet due (0 days overdue)", () => {
    assert.equal(daysOverdue("2026-09-01", TODAY), 0)
    assert.equal(bucketForDaysOverdue(0), "not_yet_due")
  })

  it("due yesterday is 1 day overdue → d1_14", () => {
    assert.equal(daysOverdue("2026-08-31", TODAY), 1)
    assert.equal(bucketForDaysOverdue(1), "d1_14")
  })

  it("14 vs 15 days overdue sit on either side of d1_14 / d15_30", () => {
    assert.equal(daysOverdue("2026-08-18", TODAY), 14)
    assert.equal(bucketForDaysOverdue(14), "d1_14")
    assert.equal(daysOverdue("2026-08-17", TODAY), 15)
    assert.equal(bucketForDaysOverdue(15), "d15_30")
  })

  it("future due dates (14 vs 15 days out) stay not_yet_due", () => {
    assert.equal(daysOverdue("2026-09-15", TODAY), 0)
    assert.equal(daysOverdue("2026-09-16", TODAY), 0)
    assert.equal(bucketForDaysOverdue(daysOverdue("2026-09-15", TODAY)), "not_yet_due")
  })
})

describe("owed inclusion", () => {
  it("a PAID invoice appears in no bucket", () => {
    assert.equal(isLiveOutstandingAr("PAID", 0), false)
    assert.equal(isLiveOutstandingAr("AUTHORISED", 0), false)
    const ledger = buildOwedLedger(
      [
        inv({
          id: "paid",
          status: "PAID",
          amountDue: 0,
          amountPaid: 110,
          fullyPaidDate: "2026-08-20",
        }),
      ],
      { todayYmd: TODAY }
    )
    assert.equal(ledger.rows.length, 0)
    assert.equal(ledger.totals.count, 0)
    assert.equal(ledger.totals.outstandingCents, 0)
    for (const bucket of Object.values(ledger.buckets)) {
      assert.equal(bucket.count, 0)
      assert.equal(bucket.amountCents, 0)
    }
  })

  it("VOIDED and DELETED invoices are excluded from rows, buckets, and totals", () => {
    const ledger = buildOwedLedger(
      [
        inv({ id: "void", status: "VOIDED", amountDue: 50 }),
        inv({ id: "del", status: "DELETED", amountDue: 50 }),
      ],
      { todayYmd: TODAY }
    )
    assert.equal(ledger.rows.length, 0)
    assert.equal(ledger.totals.count, 0)
  })
})

describe("owed coverage and fixture totals", () => {
  it("an unresolved-client invoice appears in coverage, its own group, and totals", () => {
    const ledger = buildOwedLedger(
      [
        inv({ id: "ok", subTotal: 100, amountDue: 110, dueDate: TODAY }),
        inv({
          id: "orphan",
          resolved: false,
          clientsId: null,
          clientName: null,
          contactName: "Mystery Co",
          subTotal: 50,
          amountDue: 55,
          dueDate: "2026-08-31",
        }),
      ],
      { todayYmd: TODAY }
    )
    assert.equal(ledger.coverage.totalCount, 2)
    assert.equal(ledger.coverage.resolvedCount, 1)
    assert.equal(ledger.coverage.unresolvedCount, 1)
    assert.equal(ledger.coverage.unresolvedAmountCents, dollarsToCents(50))
    const orphan = ledger.rows.find((r) => r.invoiceNumber === "INV-orphan")
    assert.ok(orphan)
    assert.equal(orphan!.clientName, OWED_UNRESOLVED_CLIENT_LABEL)
    assert.equal(orphan!.resolved, false)
    assert.equal(orphan!.group, "unresolved")
    assert.equal(ledger.totals.count, 2)
    assert.equal(ledger.totals.outstandingCents, dollarsToCents(100) + dollarsToCents(50))
  })

  it("fixture totals match a hand-computed figure", () => {
    // Hand: 100 + 40.50 + 10 + 20.25 + 7.70 = 178.45 → 17845 cents (ex-GST sub_total)
    const ledger = buildOwedLedger(
      [
        inv({ id: "a", subTotal: 100, amountDue: 110, dueDate: TODAY }),
        inv({ id: "b", subTotal: 40.5, amountDue: 44.55, dueDate: "2026-08-31" }),
        inv({ id: "c", subTotal: 10, amountDue: 11, dueDate: "2026-08-18" }),
        inv({ id: "d", subTotal: 20.25, amountDue: 22.275, dueDate: "2026-08-17" }),
        inv({
          id: "e",
          status: "PAID",
          subTotal: 999,
          amountDue: 0,
          amountPaid: 1098.9,
        }),
        inv({
          id: "f",
          resolved: false,
          clientsId: null,
          clientName: null,
          subTotal: 7.7,
          amountDue: 8.47,
          dueDate: "2026-07-02",
        }),
      ],
      { todayYmd: TODAY }
    )
    const expectedCents =
      dollarsToCents(100) +
      dollarsToCents(40.5) +
      dollarsToCents(10) +
      dollarsToCents(20.25) +
      dollarsToCents(7.7)
    assert.equal(expectedCents, 17845)
    assert.equal(ledger.totals.outstandingCents, expectedCents)
    assert.equal(ledger.totals.count, 5)
    assert.equal(ledger.buckets.not_yet_due.count, 1)
    assert.equal(ledger.buckets.d1_14.count, 2)
    assert.equal(ledger.buckets.d15_30.count, 1)
    assert.equal(ledger.buckets.d60_plus.count, 1)
    assert.equal(ledger.rows.every((r) => r.totalCents === r.outstandingCents + r.paidCents), true)
  })
})
