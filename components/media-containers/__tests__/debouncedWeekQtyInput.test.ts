import assert from "node:assert/strict"
import test from "node:test"

import { nextDraftFromCommitted } from "@/components/media-containers/DebouncedWeekQtyInput"

test("nextDraftFromCommitted: while dirty ignores parent echoes", () => {
  assert.equal(nextDraftFromCommitted(true, "12", "1"), null)
  assert.equal(nextDraftFromCommitted(true, "12", "12"), null)
})

test("nextDraftFromCommitted: when clean adopts changed committed value", () => {
  assert.equal(nextDraftFromCommitted(false, "1", "42"), "42")
  assert.equal(nextDraftFromCommitted(false, "42", "42"), null)
})
