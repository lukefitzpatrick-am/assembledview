import assert from "node:assert/strict"
import { test } from "node:test"

import {
  buildOpsHealthSubject,
  daysBehindMaxDate,
  freshnessStatus,
  rowVolumeStatus,
  summariseStatuses,
} from "../status"

test("subject all green", () => {
  assert.equal(
    buildOpsHealthSubject([
      { name: "A", status: "green", detail: "ok" },
      { name: "B", status: "green", detail: "ok" },
    ]),
    "AV ops ✅ all green",
  )
})

test("subject amber only", () => {
  assert.equal(
    buildOpsHealthSubject([
      { name: "A", status: "green", detail: "ok" },
      { name: "B", status: "amber", detail: "warn" },
      { name: "C", status: "amber", detail: "warn" },
    ]),
    "AV ops ⚠ 2 amber",
  )
})

test("subject red uses first red name", () => {
  assert.equal(
    buildOpsHealthSubject([
      { name: "Warehouse freshness", status: "red", detail: "stale" },
      { name: "Xano", status: "amber", detail: "x" },
    ]),
    "AV ops 🔴 1 red — Warehouse freshness",
  )
})

test("freshness thresholds", () => {
  assert.equal(freshnessStatus(0), "green")
  assert.equal(freshnessStatus(1), "green")
  assert.equal(freshnessStatus(2), "amber")
  assert.equal(freshnessStatus(3), "red")
  assert.equal(freshnessStatus(null), "red")
})

test("daysBehindMaxDate", () => {
  assert.equal(daysBehindMaxDate("2026-07-10", "2026-07-11"), 1)
  assert.equal(daysBehindMaxDate("2026-07-09", "2026-07-11"), 2)
  assert.equal(daysBehindMaxDate(null, "2026-07-11"), null)
})

test("row volume anomaly", () => {
  assert.equal(rowVolumeStatus(100, 100), "green")
  assert.equal(rowVolumeStatus(40, 100), "amber")
  assert.equal(rowVolumeStatus(0, 100), "red")
  assert.equal(rowVolumeStatus(0, 0), "green")
})

test("summariseStatuses", () => {
  const s = summariseStatuses([
    { name: "a", status: "green", detail: "" },
    { name: "b", status: "amber", detail: "" },
    { name: "c", status: "red", detail: "" },
    { name: "d", status: "red", detail: "" },
  ])
  assert.deepEqual(s, { greenCount: 1, amberCount: 1, redCount: 2 })
})
