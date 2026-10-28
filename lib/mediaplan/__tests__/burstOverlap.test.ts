import assert from "node:assert/strict"
import test from "node:test"

import {
  BURST_OVERLAP_HINT,
  describeBurstOverlap,
  findOverlappingBursts,
} from "@/lib/mediaplan/burstOverlap"

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day)

test("back-to-back bursts do not overlap; a shared day does", () => {
  assert.deepEqual(
    findOverlappingBursts([
      { startDate: d(2026, 8, 17), endDate: d(2026, 8, 23) },
      { startDate: d(2026, 8, 24), endDate: d(2026, 8, 30) },
    ]),
    []
  )
  const one = findOverlappingBursts([
    { startDate: d(2026, 8, 17), endDate: d(2026, 8, 23) },
    { startDate: d(2026, 8, 23), endDate: d(2026, 8, 30) },
  ])
  assert.equal(one.length, 1)
  assert.equal(one[0]!.days, 1)
  assert.equal(describeBurstOverlap(one[0]!), "Bursts 1 and 2 overlap on 23 Aug 2026 (1 day).")
})

test("PENFOLD018PV1 shape: each burst overlaps the next by a week", () => {
  const out = findOverlappingBursts([
    { startDate: d(2026, 7, 1), endDate: d(2026, 8, 1) },
    { startDate: d(2026, 7, 26), endDate: d(2026, 9, 5) },
    { startDate: d(2026, 8, 30), endDate: d(2026, 10, 3) },
  ])
  assert.deepEqual(
    out.map((o) => [o.first, o.second, o.days]),
    [
      [1, 2, 7],
      [2, 3, 7],
    ]
  )
  assert.equal(describeBurstOverlap(out[0]!), "Bursts 1 and 2 overlap from 26 Jul 2026 to 1 Aug 2026 (7 days).")
})

test("a duplicate burst and a burst inside another (BOSS011NP2, hema008PD2 shapes)", () => {
  const dup = findOverlappingBursts([
    { startDate: d(2027, 6, 1), endDate: d(2027, 6, 30) },
    { startDate: d(2027, 6, 1), endDate: d(2027, 6, 30) },
  ])
  assert.deepEqual(dup.map((o) => o.days), [30])
  const inside = findOverlappingBursts([
    { startDate: d(2026, 9, 7), endDate: d(2027, 10, 30) },
    { startDate: d(2027, 1, 1), endDate: d(2027, 1, 31) },
  ])
  assert.equal(inside[0]!.days, 31)
  assert.equal(describeBurstOverlap(inside[0]!), "Bursts 1 and 2 overlap from 1 Jan 2027 to 31 Jan 2027 (31 days).")
})

test("missing, unreadable and end-before-start bursts are ignored; strings use the civil day", () => {
  assert.deepEqual(
    findOverlappingBursts([
      { startDate: d(2026, 8, 1), endDate: d(2026, 8, 31) },
      { startDate: null, endDate: d(2026, 8, 31) },
      { startDate: "not a date", endDate: d(2026, 8, 31) },
      { startDate: d(2026, 8, 20), endDate: d(2026, 8, 10) },
      null,
    ]),
    []
  )
  assert.deepEqual(findOverlappingBursts(undefined), [])
  const strings = findOverlappingBursts([
    { startDate: "2026-08-01", endDate: "2026-08-10" },
    { startDate: "2026-08-10", endDate: "2026-08-20" },
  ])
  assert.deepEqual(strings.map((o) => [o.first, o.second, o.days]), [[1, 2, 1]])
  assert.match(BURST_OVERLAP_HINT, /Saving is not blocked/)
})
