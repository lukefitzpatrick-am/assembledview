/**
 * C-157: replace_line and reset_line refuse to move a locked true-up month
 * (BillingOverrideWriteError TRUE_UP_LOCKED, 409 at the route).
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { assertTrueUpLocksKept, BillingOverrideWriteError } from "../writeBillingOverrides"

const locks = async () => [{ actionId: 1, component: "fee" as const, months: ["2026-07"], asOfMonth: "2026-09" }]
const readRows = async () => [{ lineItemId: "G025SM1", component: "fee", months: [{ month: "2026-07", amount: 100 }, { month: "2026-11", amount: 400 }] }]
const base = { versionId: 41, mbaNumber: "golf025", lineItemId: "G025SM1", components: ["fee" as const] }

test("reset_line on a locked line throws TRUE_UP_LOCKED", async () => {
  await assert.rejects(
    () => assertTrueUpLocksKept({ ...base, after: null }, { loadLocks: locks, readRows }),
    (e: unknown) => e instanceof BillingOverrideWriteError && e.code === "TRUE_UP_LOCKED" && /Undo the true-up first/.test(e.message),
  )
})

test("replace_line keeping the locked month passes; changing it throws", async () => {
  await assertTrueUpLocksKept({ ...base, after: { component: "fee", months: [{ month: "2026-07", amount: 100 }, { month: "2026-12", amount: 400 }] } }, { loadLocks: locks, readRows })
  await assert.rejects(
    () => assertTrueUpLocksKept({ ...base, after: { component: "fee", months: [{ month: "2026-07", amount: 500 }] } }, { loadLocks: locks, readRows }),
    (e: unknown) => e instanceof BillingOverrideWriteError && e.code === "TRUE_UP_LOCKED",
  )
})

test("no applied true-up: nothing is read and nothing is refused", async () => {
  let read = 0
  await assertTrueUpLocksKept({ ...base, after: null }, { loadLocks: async () => [], readRows: async () => (read++, []) })
  assert.equal(read, 0)
})
