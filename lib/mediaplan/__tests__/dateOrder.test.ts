import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

import {
  END_BEFORE_START_MESSAGE,
  endIsBeforeStart,
  lineGroupsHaveEndBeforeStart,
} from "@/lib/mediaplan/dateOrder"

test("end date 31 Oct 2026 is before start 15 Nov 2026", () => {
  assert.equal(
    endIsBeforeStart(new Date(2026, 10, 15), new Date(2026, 9, 31)),
    true,
  )
  assert.equal(endIsBeforeStart("2026-11-15", "2026-10-31"), true)
  assert.equal(
    END_BEFORE_START_MESSAGE,
    "End date must be on or after the start date",
  )
})

test("the same civil day and a missing date are allowed", () => {
  assert.equal(endIsBeforeStart(new Date(2026, 10, 15), new Date(2026, 10, 15)), false)
  assert.equal(endIsBeforeStart("2026-11-15", "2026-11-16"), false)
  assert.equal(endIsBeforeStart("2026-11-15", null), false)
  assert.equal(endIsBeforeStart(undefined, "2026-10-31"), false)
})

test("a burst end before its start blocks the line group", () => {
  assert.equal(
    lineGroupsHaveEndBeforeStart([
      [{ bursts: [{ startDate: "2026-11-15", endDate: "2026-10-31" }] }],
    ]),
    true,
  )
  assert.equal(
    lineGroupsHaveEndBeforeStart([
      [{ bursts: [{ start_date: "2026-11-15", end_date: "2026-11-15" }] }],
    ]),
    false,
  )
})

test("every calendar starts the week on Monday", () => {
  const source = readFileSync(
    path.join(process.cwd(), "components/ui/calendar.tsx"),
    "utf8",
  )
  assert.match(source, /weekStartsOn=\{1\}/)
})
