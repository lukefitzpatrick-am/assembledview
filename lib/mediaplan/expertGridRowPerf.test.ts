import { describe, it } from "node:test"
import assert from "node:assert/strict"

import {
  buildMapsPreservingIdentity,
  finalizeRowsPreservingIdentity,
  mapRowAtIndex,
  normalizeRowsPreservingIdentity,
  updateRowAtIndex,
} from "./expertGridRowPerf"

type Row = {
  id: string
  label: string
  weeklyValues: Record<string, number | "">
  mergedWeekSpans: readonly { id: string }[]
}

function row(id: string, label: string, weekKeys: string[]): Row {
  const weeklyValues: Record<string, number | ""> = {}
  for (const k of weekKeys) weeklyValues[k] = ""
  return { id, label, weeklyValues, mergedWeekSpans: [] }
}

describe("updateRowAtIndex", () => {
  it("patches one row and preserves object identity for all others", () => {
    const weekKeys = ["2025-W01", "2025-W02"]
    const rows = [
      row("a", "A", weekKeys),
      row("b", "B", weekKeys),
      row("c", "C", weekKeys),
    ]
    const next = updateRowAtIndex(rows, 1, { label: "B2" })
    assert.ok(next)
    assert.equal(next![0], rows[0])
    assert.equal(next![2], rows[2])
    assert.notEqual(next![1], rows[1])
    assert.deepEqual(next![1], { ...rows[1], label: "B2" })
  })

  it("returns null for out-of-range index", () => {
    assert.equal(updateRowAtIndex([row("a", "A", [])], 3, { label: "x" }), null)
    assert.equal(updateRowAtIndex([row("a", "A", [])], -1, { label: "x" }), null)
  })
})

describe("mapRowAtIndex", () => {
  it("maps one row and keeps sibling identities", () => {
    const rows = [row("a", "A", []), row("b", "B", []), row("c", "C", [])]
    const next = mapRowAtIndex(rows, 0, (r) => ({ ...r, label: "A2" }))
    assert.ok(next)
    assert.equal(next![0].label, "A2")
    assert.equal(next![1], rows[1])
    assert.equal(next![2], rows[2])
  })
})

describe("finalizeRowsPreservingIdentity", () => {
  it("keeps row identity when finalize returns the same reference", () => {
    const rows = [row("a", "A", []), row("b", "B", [])]
    const out = finalizeRowsPreservingIdentity(rows, (r) => r)
    assert.equal(out[0], rows[0])
    assert.equal(out[1], rows[1])
  })

  it("only replaces rows finalize mutates", () => {
    const rows = [row("a", "A", []), row("b", "B", [])]
    const out = finalizeRowsPreservingIdentity(rows, (r) =>
      r.id === "b" ? { ...r, label: "B2" } : r
    )
    assert.equal(out[0], rows[0])
    assert.notEqual(out[1], rows[1])
    assert.equal(out[1].label, "B2")
  })
})

describe("normalizeRowsPreservingIdentity", () => {
  it("rebuilds only changed source rows across calls", () => {
    const weekKeys = ["2025-W01", "2025-W02"]
    const rows1 = [
      row("a", "A", weekKeys),
      row("b", "B", weekKeys),
      row("c", "C", weekKeys),
    ]
    let normalizeCalls = 0
    const normalizeOne = (r: Row, keys: readonly string[]): Row => {
      normalizeCalls += 1
      const weeklyValues: Record<string, number | ""> = {}
      for (const k of keys) weeklyValues[k] = r.weeklyValues[k] ?? ""
      return { ...r, weeklyValues, mergedWeekSpans: r.mergedWeekSpans ?? [] }
    }

    const cache = new Map()
    const first = normalizeRowsPreservingIdentity(rows1, weekKeys, normalizeOne, cache)
    assert.equal(normalizeCalls, 3)
    assert.equal(first.rows.length, 3)

    const rows2 = mapRowAtIndex(first.rows, 1, (r) => ({ ...r, label: "B2" }))!
    normalizeCalls = 0
    const second = normalizeRowsPreservingIdentity(
      rows2,
      weekKeys,
      normalizeOne,
      first.cache
    )
    assert.equal(normalizeCalls, 1)
    assert.equal(second.rows[0], first.rows[0])
    assert.equal(second.rows[2], first.rows[2])
    assert.notEqual(second.rows[1], first.rows[1])
    assert.equal(second.rows[1].label, "B2")
  })

  it("invalidates all rows when weekKeys identity changes", () => {
    const weekKeysA = ["2025-W01"]
    const weekKeysB = ["2025-W01", "2025-W02"]
    const rows = [row("a", "A", weekKeysA)]
    let calls = 0
    const normalizeOne = (r: Row, keys: readonly string[]): Row => {
      calls += 1
      const weeklyValues: Record<string, number | ""> = {}
      for (const k of keys) weeklyValues[k] = ""
      return { ...r, weeklyValues }
    }
    const first = normalizeRowsPreservingIdentity(
      rows,
      weekKeysA,
      normalizeOne,
      new Map()
    )
    calls = 0
    normalizeRowsPreservingIdentity(rows, weekKeysB, normalizeOne, first.cache)
    assert.equal(calls, 1)
  })
})

describe("buildMapsPreservingIdentity", () => {
  it("reuses map objects for unchanged row span sources", () => {
    const weekKeys = ["2025-W01"]
    const rows1 = [row("a", "A", weekKeys), row("b", "B", weekKeys)]
    let builds = 0
    const buildOne = (r: Row) => {
      builds += 1
      return { rowId: r.id, spansRef: r.mergedWeekSpans }
    }
    const first = buildMapsPreservingIdentity(
      rows1,
      weekKeys,
      (r) => r.mergedWeekSpans,
      buildOne,
      new Map()
    )
    assert.equal(builds, 2)

    const rows2 = mapRowAtIndex(rows1, 0, (r) => ({
      ...r,
      label: "A2",
    }))!
    builds = 0
    const second = buildMapsPreservingIdentity(
      rows2,
      weekKeys,
      (r) => r.mergedWeekSpans,
      buildOne,
      first.cache
    )
    assert.equal(builds, 0)
    assert.equal(second.maps[0], first.maps[0])
    assert.equal(second.maps[1], first.maps[1])
  })
})

describe("updateRowAtIndex scale", () => {
  it("preserves identity for 299 of 300 rows when patching one", () => {
    const weekKeys = Array.from({ length: 52 }, (_, i) => `2025-W${String(i + 1).padStart(2, "0")}`)
    const rows = Array.from({ length: 300 }, (_, i) =>
      row(`r${i}`, `L${i}`, weekKeys)
    )
    const t0 = performance.now()
    const next = updateRowAtIndex(rows, 150, { label: "patched" })
    const ms = performance.now() - t0
    assert.ok(next)
    let preserved = 0
    for (let i = 0; i < rows.length; i++) {
      if (next![i] === rows[i]) preserved++
    }
    assert.equal(preserved, 299)
    assert.notEqual(next![150], rows[150])
    assert.ok(ms < 50)
  })
})
