import assert from "node:assert/strict"
import { test } from "node:test"
import { PERIOD_STATUS_LADDER, PERIOD_STATUS_LABEL } from "../labels"

test("period status ladder is open→…→reconciled", () => {
  assert.deepEqual(PERIOD_STATUS_LADDER, [
    "open",
    "pre_run_review",
    "run",
    "review",
    "locked",
    "invoiced",
    "reconciled",
  ])
  for (const s of PERIOD_STATUS_LADDER) {
    assert.ok(PERIOD_STATUS_LABEL[s])
  }
})
