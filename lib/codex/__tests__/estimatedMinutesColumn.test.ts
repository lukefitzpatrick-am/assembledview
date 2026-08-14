import assert from "node:assert/strict"
import { test } from "node:test"

import { executeRows } from "../estimatedMinutesColumn"

test("executeRows reads drizzle array results and { rows }", () => {
  assert.deepEqual(executeRows([{ present: true }]), [{ present: true }])
  assert.deepEqual(executeRows({ rows: [{ id: 1, estimated_minutes: 90 }] }), [
    { id: 1, estimated_minutes: 90 },
  ])
  assert.deepEqual(executeRows(null), [])
  assert.deepEqual(executeRows({}), [])
})
