import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  amountsWithinCent,
  learnContactLink,
  periodShouldReconcile,
  referenceContainsInvoiceRef,
  runThreeTierMatcher,
  shouldEscalateDay10,
  shouldInsertDay10Escalation,
  type MatcherArInvoice,
  type MatcherRunItem,
} from "../threeTier.js"

const item = (partial: Partial<MatcherRunItem> & Pick<MatcherRunItem, "id">): MatcherRunItem => ({
  periodId: 1,
  periodMonth: "2026-06",
  invoiceReference: "AV-MBA001-202606",
  amountCents: 10000,
  clientId: 42,
  status: "approved",
  ...partial,
})

const inv = (
  partial: Partial<MatcherArInvoice> & Pick<MatcherArInvoice, "xeroInvoiceId">
): MatcherArInvoice => ({
  invoiceNumber: "INV-1",
  referenceRaw: "AV-MBA001-202606",
  contactKey: "ACME PTY LTD",
  xeroContactId: "c1",
  issueDate: "2026-06-15",
  amountCents: 10000,
  status: "AUTHORISED",
  ...partial,
})

describe("PC6 amountsWithinCent $0.01 boundary", () => {
  it("treats 1 cent as within tolerance, 2 cents not", () => {
    assert.equal(amountsWithinCent(10000, 10001), true)
    assert.equal(amountsWithinCent(10000, 9999), true)
    assert.equal(amountsWithinCent(10000, 10002), false)
  })
})

describe("PC6 tier 1 reference match", () => {
  it("auto-matches silently when reference contains invoice_reference and amount within 1c", () => {
    const r = runThreeTierMatcher({
      runItems: [item({ id: 1 })],
      invoices: [inv({ xeroInvoiceId: "x1", amountCents: 10001 })],
      contactLinks: [],
      firstPeriodMonth: "2026-01",
    })
    assert.equal(r.stats.tier1Matched, 1)
    assert.equal(r.autoMatched, 1)
    assert.equal(r.cards.length, 0)
    assert.equal(r.decisions[0]?.status, "matched")
    assert.equal(r.decisions[0]?.method, "reference")
  })

  it("emits divergence card when reference matches but amount differs >1c", () => {
    const r = runThreeTierMatcher({
      runItems: [item({ id: 1, amountCents: 10000 })],
      invoices: [inv({ xeroInvoiceId: "x1", amountCents: 12000 })],
      contactLinks: [],
      firstPeriodMonth: "2026-01",
    })
    assert.equal(r.stats.tier1Diverged, 1)
    assert.equal(r.cards[0]?.cardKind, "divergence")
    assert.equal(r.cards[0]?.deltaCents, 2000)
    assert.ok(String(r.cards[0]?.detail).includes("Δ"))
  })

  it("referenceContainsInvoiceRef is case-insensitive substring", () => {
    assert.equal(
      referenceContainsInvoiceRef("PO 1 AV-mba001-202606 extra", "AV-MBA001-202606"),
      true
    )
    assert.equal(referenceContainsInvoiceRef("other", "AV-MBA001-202606"), false)
  })
})

describe("PC6 tier 2 heuristic suggestion", () => {
  it("suggests when contact+amount+month match and no reference", () => {
    const r = runThreeTierMatcher({
      runItems: [item({ id: 2, invoiceReference: "AV-OTHER-202606" })],
      invoices: [
        inv({
          xeroInvoiceId: "x2",
          referenceRaw: "nope",
          contactKey: "Acme Pty Ltd",
          amountCents: 10000,
        }),
      ],
      contactLinks: [{ xeroContactKey: "ACME PTY LTD", clientId: 42 }],
      firstPeriodMonth: "2026-01",
    })
    assert.equal(r.stats.tier2Suggested, 1)
    assert.equal(r.cards[0]?.cardKind, "suggestion")
    assert.equal(r.cards[0]?.method, "heuristic")
  })
})

describe("PC6 duplicate + orphan passes", () => {
  it("flags duplicate when two invoices match one run item", () => {
    const r = runThreeTierMatcher({
      runItems: [item({ id: 1 })],
      invoices: [
        inv({ xeroInvoiceId: "x1", invoiceNumber: "A" }),
        inv({ xeroInvoiceId: "x2", invoiceNumber: "B" }),
      ],
      contactLinks: [],
      firstPeriodMonth: "2026-01",
    })
    assert.equal(r.stats.duplicates, 1)
    assert.ok(r.cards.some((c) => c.cardKind === "duplicate"))
  })

  it("flags orphan AR from firstPeriodMonth with no run item", () => {
    const r = runThreeTierMatcher({
      runItems: [item({ id: 1 })],
      invoices: [
        inv({
          xeroInvoiceId: "orphan1",
          referenceRaw: "unrelated",
          contactKey: "UNKNOWN",
          issueDate: "2026-03-01",
          amountCents: 5000,
        }),
      ],
      contactLinks: [],
      firstPeriodMonth: "2026-01",
    })
    assert.equal(r.stats.orphans, 1)
    assert.ok(r.cards.some((c) => c.cardKind === "orphan"))
  })
})

describe("PC6 learn-forever contact links", () => {
  it("manual assign upserts contact link by key", () => {
    const next = learnContactLink({
      xeroContactKey: "acme pty ltd",
      clientId: 99,
      existing: [{ xeroContactKey: "OTHER", clientId: 1 }],
    })
    assert.equal(next.length, 2)
    assert.equal(
      next.find((l) => l.xeroContactKey === "acme")?.clientId,
      99
    )
  })
})

describe("PC6 reconcile + day-10 escalate", () => {
  it("reconciles only when card list empty", () => {
    assert.equal(periodShouldReconcile(0), true)
    assert.equal(periodShouldReconcile(2), false)
  })

  it("escalates from day 10 of period month", () => {
    assert.equal(
      shouldEscalateDay10({
        periodMonth: "2026-06",
        now: new Date("2026-06-10T14:00:00Z"),
        openCardCount: 1,
      }),
      true
    )
    assert.equal(
      shouldEscalateDay10({
        periodMonth: "2026-06",
        now: new Date("2026-06-09T00:00:00Z"),
        openCardCount: 1,
      }),
      false
    )
  })

  it("O7: day 10..14 inserts exactly one escalation card per period", () => {
    let already = false
    let inserted = 0
    for (let day = 10; day <= 14; day++) {
      const now = new Date(Date.UTC(2026, 5, day, 14, 0, 0))
      if (
        shouldInsertDay10Escalation({
          periodMonth: "2026-06",
          now,
          openCardCount: 3,
          alreadyEscalatedForPeriod: already,
        })
      ) {
        inserted += 1
        already = true
      }
    }
    assert.equal(inserted, 1)
  })
})

