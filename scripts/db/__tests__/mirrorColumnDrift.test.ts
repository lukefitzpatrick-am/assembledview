import assert from "node:assert/strict"
import test from "node:test"

import {
  findMirrorColumnsMissingFromLive,
  formatMirrorAheadMessage,
} from "../mirrorColumnDrift"

test("drift check fails on a fixture where the mirror declares a missing column", () => {
  const missing = findMirrorColumnsMissingFromLive(
    [
      { table: "finance_billing_records", column: "id" },
      { table: "finance_billing_records", column: "approved_at" },
    ],
    [{ table: "finance_billing_records", column: "id" }],
  )
  assert.deepEqual(missing, [
    { table: "finance_billing_records", column: "approved_at" },
  ])
  const message = formatMirrorAheadMessage(missing)
  assert.ok(message.includes("FATAL"))
  assert.ok(message.includes("finance_billing_records.approved_at"))
  assert.ok(message.includes("Apply the migration BEFORE"))
})

test("drift check passes on a matching schema", () => {
  const missing = findMirrorColumnsMissingFromLive(
    [
      { table: "clients", column: "id" },
      { table: "clients", column: "mp_client_name" },
    ],
    [
      { table: "clients", column: "id" },
      { table: "clients", column: "mp_client_name" },
      { table: "clients", column: "extra_live_only" },
    ],
  )
  assert.deepEqual(missing, [])
  assert.equal(formatMirrorAheadMessage(missing), "")
})
