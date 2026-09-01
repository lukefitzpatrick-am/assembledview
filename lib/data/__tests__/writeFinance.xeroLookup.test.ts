/**
 * T0-11 — xero: guards for the four writeFinance exports that look up the key
 * from the DB first. Stub getDb so CI without DATABASE_URL still exercises them.
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

const fakeDb = {
  execute: async () => [{ invoice_key: "xero:INV-1" }],
}

if (supportsMockModule()) {
  await mock.module!("@/db", {
    namedExports: {
      getDb: () => fakeDb,
      schema: {},
    },
  })
}

const writeFinance = supportsMockModule() ? await import("../writeFinance") : null

async function expectXeroRefused(fn: () => Promise<unknown>): Promise<void> {
  assert.ok(writeFinance)
  await assert.rejects(fn, (err: unknown) => {
    assert.ok(err instanceof writeFinance!.FinanceBillingWriteError)
    assert.equal(err.code, "XERO_KEY_REFUSED")
    return true
  })
}

test("patchFinanceBillingRecordById refuses a xero: parent key", { skip }, async () => {
  await expectXeroRefused(() =>
    writeFinance!.patchFinanceBillingRecordById(1, { notes: "no" })
  )
})

test("createFinanceBillingLineItem refuses a xero: parent key", { skip }, async () => {
  await expectXeroRefused(() =>
    writeFinance!.createFinanceBillingLineItem({
      finance_billing_records_id: 1,
      item_code: "TV",
      amount: 10,
    })
  )
})

test("patchFinanceBillingLineItemById refuses a xero: parent key", { skip }, async () => {
  await expectXeroRefused(() =>
    writeFinance!.patchFinanceBillingLineItemById(1, { amount: 11 })
  )
})

test("deleteFinanceBillingLineItemById refuses a xero: parent key", { skip }, async () => {
  await expectXeroRefused(() => writeFinance!.deleteFinanceBillingLineItemById(1))
})
