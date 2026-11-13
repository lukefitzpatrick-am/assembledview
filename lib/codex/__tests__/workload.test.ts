/** B42 workload (plan 5.5): Sydney weeks, buckets per person, the weeks query. */
import assert from "node:assert/strict"
import { test } from "node:test"

import { buildWorkload, parseWorkloadWeeks, workloadWeeks } from "../workload.js"

test("weeks start on the Sydney Monday, this week first", () => {
  // Thursday 13 Nov 2026 01:00 UTC is Thursday 12:00 in Sydney.
  const { today, weeks } = workloadWeeks(new Date("2026-11-13T01:00:00Z"), 3)
  assert.equal(today, "2026-11-13")
  assert.deepEqual(weeks, [
    { start: "2026-11-09", end: "2026-11-15" },
    { start: "2026-11-16", end: "2026-11-22" },
    { start: "2026-11-23", end: "2026-11-29" },
  ])
  // Sunday 15 Nov 22:00 UTC is Monday 16 Nov in Sydney: a new week.
  assert.equal(workloadWeeks(new Date("2026-11-15T22:00:00Z"), 1).weeks[0].start, "2026-11-16")
})

test("buckets: overdue, this week, later, no due date; people off the list are not shown", () => {
  const { today, weeks } = workloadWeeks(new Date("2026-11-13T01:00:00Z"), 2)
  const people = buildWorkload(
    [
      { email: "Mia@X.au", name: "Mia" },
      { email: "josh@x.au", name: "Josh" },
    ],
    [
      { email: "mia@x.au", due_on: "2026-11-01", n: 2 },
      { email: "mia@x.au", due_on: "2026-11-10", n: 1 },
      { email: "mia@x.au", due_on: "2026-11-14", n: 3 },
      { email: "mia@x.au", due_on: "2026-11-20", n: 4 },
      { email: "mia@x.au", due_on: "2026-12-25", n: 5 },
      { email: "mia@x.au", due_on: null, n: 6 },
      { email: "contractor@gmail.example", due_on: "2026-11-14", n: 9 },
    ],
    today,
    weeks
  )
  assert.deepEqual(people[0], { email: "mia@x.au", name: "Mia", open: 21, overdue: 3, no_due: 6, by_week: [4, 4], later: 5 })
  assert.deepEqual(people[1], { email: "josh@x.au", name: "Josh", open: 0, overdue: 0, no_due: 0, by_week: [0, 0], later: 0 })
})

test("weeks query: 1 to 12, else 6", () => {
  assert.equal(parseWorkloadWeeks("3"), 3)
  for (const raw of [null, "", "0", "13", "2.5", "x"]) assert.equal(parseWorkloadWeeks(raw), 6, String(raw))
})

test("due today is this week's work, not overdue; yesterday is overdue (B42fix, R31)", () => {
  const { today, weeks } = workloadWeeks(new Date("2026-11-13T01:00:00Z"), 1)
  const [mia] = buildWorkload(
    [{ email: "mia@x.au", name: "Mia" }],
    [
      { email: "mia@x.au", due_on: today, n: 2 },
      { email: "mia@x.au", due_on: "2026-11-12", n: 1 },
    ],
    today,
    weeks
  )
  assert.deepEqual(mia, { email: "mia@x.au", name: "Mia", open: 3, overdue: 1, no_due: 0, by_week: [3], later: 0 })
})
