/**
 * RUNFIX2 (RUNFIX review R1): the local-day helpers in `lib/dates/civil` serve
 * date pickers and the plan grids, which run in the browser. They run here in
 * Melbourne, where local midnight is the day before in UTC, so a helper that
 * reads UTC parts fails.
 */
import "@/lib/testing/melbourneZone"
import assert from "node:assert/strict"
import test from "node:test"

import { parseDateOnlyString, toDateOnlyString } from "@/lib/dates/civil"

const ZONE_AT_LOAD = new Intl.DateTimeFormat().resolvedOptions().timeZone

test("the subject loads in Melbourne", () => {
  assert.equal(ZONE_AT_LOAD, "Australia/Melbourne")
})

test("toDateOnlyString reads a local-midnight Date as its own local day", () => {
  assert.equal(toDateOnlyString(new Date(2026, 0, 1)), "2026-01-01") // 2025-12-31T13:00Z
  assert.equal(toDateOnlyString(new Date(2026, 6, 1)), "2026-07-01") // 2026-06-30T14:00Z
})

test("parseDateOnlyString gives local midnight of that day", () => {
  const d = parseDateOnlyString("2026-07-01")
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()], [2026, 6, 1, 0])
  assert.equal(d.toISOString(), "2026-06-30T14:00:00.000Z")
  assert.equal(toDateOnlyString(d), "2026-07-01")
})
