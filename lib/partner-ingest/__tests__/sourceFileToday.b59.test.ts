/**
 * B59 (C-277, S9 A): a partner file whose message has no usable received time
 * is keyed under the Melbourne day, never the UTC day. Partner ingest runs
 * only on the server, so this file runs in UTC with the clock mocked where
 * the UTC day is the day before:
 *   - 30 Nov 2026 21:00Z, 1 Dec 08:00 AEDT;
 *   - 30 Jun 2026 21:00Z, 1 Jul 07:00 AEST.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { partnerSourceFile } from "../sourceFile"

const INSTANTS = [
  { at: "2026-11-30T21:00:00Z", day: "2026-12-01", label: "1 Dec 08:00 AEDT" },
  { at: "2026-06-30T21:00:00Z", day: "2026-07-01", label: "1 Jul 07:00 AEST" },
] as const

for (const { at, day, label } of INSTANTS) {
  test(`no received time: the source file day is the Melbourne day (${label})`, (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.parse(at) })
    for (const receivedAt of ["", "  ", "not a date"]) {
      assert.equal(
        partnerSourceFile({ sourceSlug: "vistar", receivedAt, internetMessageId: "<m1@x>", attachmentName: "a.csv" }),
        `vistar/${day}/m1@x_a.csv`,
      )
    }
  })
}

test("a received time keeps its own day (the stored key does not move)", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-11-30T21:00:00Z") })
  assert.equal(
    partnerSourceFile({ sourceSlug: "vistar", receivedAt: "2026-11-30T20:00:00Z", internetMessageId: "<m1@x>", attachmentName: "a.csv" }),
    "vistar/2026-11-30/m1@x_a.csv",
  )
})
