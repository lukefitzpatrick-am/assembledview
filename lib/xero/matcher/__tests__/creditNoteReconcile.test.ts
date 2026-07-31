/**
 * O7 — dispute credit-note auto-reconcile (mocked ingest batch).
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildExpectedCreditNotePayload,
  isCreditNoteAmount,
  matchCreditNoteToDispute,
  reconcileDisputesWithCreditNotes,
} from "../creditNoteReconcile.js"

describe("O7 credit-note dispute reconcile", () => {
  it("pre-creates expected credit-note payload on Dispute", () => {
    const payload = buildExpectedCreditNotePayload({
      xeroInvoiceId: "inv-disputed",
      runItemId: 9,
      amountCents: 10000,
      contactKey: "acme",
      xeroContactId: "c1",
      expectedCreditNoteRef: "CN-1",
      reason: "wrong amount",
    })
    assert.equal(payload.preCreated, true)
    assert.equal(payload.expectedAmountCents, 10000)
    assert.equal(payload.xeroInvoiceId, "inv-disputed")
    assert.equal(payload.xeroContactId, "c1")
  })

  it("mocked ingest batch: negative AR + same contact + ±$0.01 closes dispute", () => {
    const disputes = [
      {
        xeroInvoiceId: "inv-1",
        runItemId: 1,
        amountCents: 25000,
        contactKey: "acme",
        xeroContactId: "c-acme",
      },
    ]
    // Simulate AR ingest landing a credit note (negative total).
    const creditBatch = [
      {
        xeroInvoiceId: "cn-1",
        amountCents: -25001, // within 1c
        contactKey: "acme",
        xeroContactId: "c-acme",
      },
      {
        xeroInvoiceId: "inv-other",
        amountCents: 5000,
        contactKey: "other",
        xeroContactId: "c-other",
      },
    ]

    assert.equal(isCreditNoteAmount(-25001), true)
    assert.equal(isCreditNoteAmount(5000), false)

    const hits = reconcileDisputesWithCreditNotes({
      disputes,
      creditNotes: creditBatch,
    })
    assert.equal(hits.length, 1)
    assert.equal(hits[0]?.disputedInvoiceId, "inv-1")
    assert.equal(hits[0]?.creditNoteInvoiceId, "cn-1")
  })

  it("does not match wrong contact or amount off by >1c", () => {
    const dispute = {
      xeroInvoiceId: "inv-1",
      runItemId: 1,
      amountCents: 10000,
      contactKey: "acme",
      xeroContactId: "c1",
    }
    assert.equal(
      matchCreditNoteToDispute(dispute, [
        { xeroInvoiceId: "cn-x", amountCents: -10000, contactKey: "other", xeroContactId: "c2" },
      ]),
      null
    )
    assert.equal(
      matchCreditNoteToDispute(dispute, [
        { xeroInvoiceId: "cn-y", amountCents: -10002, contactKey: "acme", xeroContactId: "c1" },
      ]),
      null
    )
  })

  it("uses each credit note at most once across disputes", () => {
    const hits = reconcileDisputesWithCreditNotes({
      disputes: [
        {
          xeroInvoiceId: "d1",
          runItemId: 1,
          amountCents: 10000,
          contactKey: "acme",
          xeroContactId: "c1",
        },
        {
          xeroInvoiceId: "d2",
          runItemId: 2,
          amountCents: 10000,
          contactKey: "acme",
          xeroContactId: "c1",
        },
      ],
      creditNotes: [
        {
          xeroInvoiceId: "cn-only",
          amountCents: -10000,
          contactKey: "acme",
          xeroContactId: "c1",
        },
      ],
    })
    assert.equal(hits.length, 1)
  })
})
