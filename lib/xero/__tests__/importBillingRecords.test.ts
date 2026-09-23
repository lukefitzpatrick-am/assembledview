import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  IMPORT_BILLING_UPSERT_SQL,
  stageImportBillingRecords,
} from "../stages/importBillingRecords"

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
})
