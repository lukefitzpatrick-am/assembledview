import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  IMPORT_BILLING_UPSERT_SQL,
  applyImportStamp,
  stageImportBillingRecords,
} from "../stages/importBillingRecords"

function conflictUpdate(sqlText: string): string {
  const at = sqlText.indexOf("ON CONFLICT")
  assert.ok(at >= 0)
  return sqlText.slice(at)
}

describe("import billing upsert", () => {
  it("runs one INSERT … SELECT … ON CONFLICT", async () => {
    const queries: unknown[] = []
    const result = await stageImportBillingRecords({
      execute: async (query) => {
        queries.push(query)
        return [
          {
            imported: 4,
            pending_edits: 1,
            media: 2,
            retainer: 1,
            sow: 1,
          },
        ]
      },
    })

    assert.equal(queries.length, 1)
    assert.match(IMPORT_BILLING_UPSERT_SQL, /INSERT INTO finance_billing_records/)
    assert.match(IMPORT_BILLING_UPSERT_SQL, /SELECT/)
    assert.match(IMPORT_BILLING_UPSERT_SQL, /FROM xero_ar_invoices/)
    assert.match(IMPORT_BILLING_UPSERT_SQL, /issue_date >= DATE '2025-07-01'/)
    assert.match(IMPORT_BILLING_UPSERT_SQL, /ON CONFLICT \(invoice_key\) DO UPDATE/)
    assert.match(IMPORT_BILLING_UPSERT_SQL, /invoice_key LIKE 'xero:%'/)
    assert.equal(result.ok, true)
    assert.equal(result.imported, 4)
    assert.equal(result.pending_edits, 1)
    assert.deepEqual(result.by_type, { media: 2, retainer: 1, sow: 1 })
    assert.equal(result.skipped_app_keys, 0)
  })

  it("keeps a human clients_id and does not rewrite notes or po_number", () => {
    const stamped = applyImportStamp({
      existingClientsId: 42,
      existingClientName: "Human Co",
      contactClientsId: 9,
      contactClientName: "Xero Contact",
      mbaClientsId: 7,
      mbaClientName: "Penfolds",
      existingMbaNumber: "PENFOLD018",
      incomingMbaNumber: "",
      billingType: "media",
      existingNotes: "do not wipe",
      existingPoNumber: "PO 100",
      incomingPoNumber: "PO 999",
      incomingStatus: "paid",
      incomingTotal: "100.00",
    })
    assert.equal(stamped.clientsId, 42)
    assert.equal(stamped.clientName, "Human Co")
    assert.equal(stamped.mbaNumber, "PENFOLD018")
    assert.equal(stamped.notes, "do not wipe")
    assert.equal(stamped.poNumber, "PO 100")
    assert.equal(stamped.status, "paid")
    assert.equal(stamped.total, "100.00")
    assert.equal(stamped.hasPendingEdits, false)

    const update = conflictUpdate(IMPORT_BILLING_UPSERT_SQL)
    assert.match(update, /clients_id = CASE/)
    assert.match(
      update,
      /finance_billing_records\.clients_id IS NOT NULL[\s\S]*finance_billing_records\.clients_id <> 0[\s\S]*THEN finance_billing_records\.clients_id/,
    )
    assert.match(update, /mba_number = CASE/)
    assert.match(update, /status = EXCLUDED\.status/)
    assert.match(update, /total = EXCLUDED\.total/)
    assert.match(update, /billed_amount_cents = EXCLUDED\.billed_amount_cents/)
    assert.match(update, /invoice_date = EXCLUDED\.invoice_date/)
    assert.doesNotMatch(update, /\bpo_number\s*=/)
    assert.doesNotMatch(update, /\bnotes\s*=/)
  })

  it("gives an MBA-only row the master's client when the contact is unresolved", () => {
    const stamped = applyImportStamp({
      existingClientsId: null,
      existingClientName: "",
      contactClientsId: null,
      contactClientName: "Unknown Pty Ltd",
      mbaClientsId: 7,
      mbaClientName: "Penfolds",
      existingMbaNumber: "",
      incomingMbaNumber: "PENFOLD018",
      billingType: "media",
      existingNotes: null,
      existingPoNumber: "PO 1",
      incomingPoNumber: "",
      incomingStatus: "invoiced",
      incomingTotal: "50.00",
    })
    assert.equal(stamped.clientsId, 7)
    assert.equal(stamped.clientName, "Penfolds")
    assert.equal(stamped.mbaNumber, "PENFOLD018")
    assert.equal(stamped.poNumber, "PO 1")
    assert.match(IMPORT_BILLING_UPSERT_SQL, /mbaidentifier/)
    assert.match(IMPORT_BILLING_UPSERT_SQL, /media_plan_masters/)
  })

  it("flips has_pending_edits off once the row has a client and an MBA", () => {
    const stamped = applyImportStamp({
      existingClientsId: 0,
      existingClientName: "",
      contactClientsId: 9,
      contactClientName: "Acme",
      mbaClientsId: null,
      mbaClientName: null,
      existingMbaNumber: null,
      incomingMbaNumber: "ACME004",
      billingType: "media",
      existingNotes: "",
      existingPoNumber: "",
      incomingPoNumber: "PO 2",
      incomingStatus: "invoiced",
      incomingTotal: "10.00",
    })
    assert.equal(stamped.clientsId, 9)
    assert.equal(stamped.hasPendingEdits, false)

    const stillPending = applyImportStamp({
      existingClientsId: null,
      existingClientName: null,
      contactClientsId: null,
      contactClientName: null,
      mbaClientsId: null,
      mbaClientName: null,
      existingMbaNumber: null,
      incomingMbaNumber: null,
      billingType: "media",
      existingNotes: null,
      existingPoNumber: null,
      incomingPoNumber: null,
      incomingStatus: "invoiced",
      incomingTotal: "10.00",
    })
    assert.equal(stillPending.hasPendingEdits, true)
  })
})
