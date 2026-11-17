/**
 * RUNFIX2 (RUNFIX review R1): the local-day helpers in `lib/dates/civil` serve
 * date pickers and the plan grids in the browser, and the server too. They
 * run here in both zones (RUNFIX2fix): Melbourne, where local midnight is the
 * day before in UTC, so a helper that reads UTC parts fails; then UTC, the
 * server's zone. `melbourneInstant` gives the same instant in both (RUNFIX2
 * review R10: its only other test runs in UTC, where local equals UTC).
 */
import "@/lib/testing/bothZones"
import assert from "node:assert/strict"
import test from "node:test"

import { parseDateOnlyString, toDateOnlyString } from "@/lib/dates/civil"
import { BUSINESS_TZ, melbourneInstant } from "@/lib/dates/melbourne"

const UTC_PASS = process.env.RUN_TESTS_UTC_PASS === "1"
/** Local midnight of 1 July 2026 in this pass's zone. */
const JULY_1_LOCAL_MIDNIGHT = UTC_PASS ? "2026-07-01T00:00:00.000Z" : "2026-06-30T14:00:00.000Z"

test("the subject runs in this pass's zone", () => {
  // Read through the subject: its local midnight shows the zone it runs in (RUNFIX2 review R8).
  assert.equal(parseDateOnlyString("2026-07-01").toISOString(), JULY_1_LOCAL_MIDNIGHT, `zone ${UTC_PASS ? "UTC" : BUSINESS_TZ}`)
})

test("toDateOnlyString reads a local-midnight Date as its own local day", () => {
  assert.equal(toDateOnlyString(new Date(2026, 0, 1)), "2026-01-01") // Melbourne: 2025-12-31T13:00Z
  assert.equal(toDateOnlyString(new Date(2026, 6, 1)), "2026-07-01") // Melbourne: 2026-06-30T14:00Z
})

test("parseDateOnlyString gives local midnight of that day", () => {
  const d = parseDateOnlyString("2026-07-01")
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()], [2026, 6, 1, 0])
  assert.equal(toDateOnlyString(d), "2026-07-01")
})

test("melbourneInstant gives the same instant whatever the host zone", () => {
  assert.equal(melbourneInstant(2026, 7, 1).toISOString(), "2026-06-30T14:00:00.000Z") // AEST
  assert.equal(melbourneInstant(2026, 1, 1).toISOString(), "2025-12-31T13:00:00.000Z") // AEDT
  assert.equal(melbourneInstant(2026, 10, 4, 2, 30).toISOString(), "2026-10-03T16:30:00.000Z") // skipped hour: 03:30 AEDT
  assert.equal(melbourneInstant(2026, 4, 5, 2, 30).toISOString(), "2026-04-04T15:30:00.000Z") // repeated hour: the AEDT one
})
