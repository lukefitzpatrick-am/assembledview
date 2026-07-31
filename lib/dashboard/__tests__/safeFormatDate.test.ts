import assert from "node:assert/strict"
import test from "node:test"

import { safeFormatDate } from "../safeFormatDate.js"

test("malformed date does not throw and renders incomplete-but-visible fallback", () => {
  assert.doesNotThrow(() => {
    assert.equal(safeFormatDate("not-a-date"), "—")
    assert.equal(safeFormatDate(""), "—")
    assert.equal(safeFormatDate(undefined), "—")
    assert.equal(safeFormatDate(null), "—")
  })
})

test("valid ISO date formats", () => {
  const label = safeFormatDate("2026-04-01T00:00:00")
  assert.match(label, /Apr/)
  assert.match(label, /2026|1/)
})
