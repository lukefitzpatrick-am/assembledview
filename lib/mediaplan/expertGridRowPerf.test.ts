import { describe, expect, it } from "vitest"

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
    expect(next).not.toBeNull()
    expect(next![0]).toBe(rows[0])
    expect(next![2]).toBe(rows[2])
    expect(next![1]).not.toBe(rows[1])
    expect(next![1]).toEqual({ ...rows[1], label: "B2" })
  })

  it("returns null for out-of-range index", () => {
    expect(updateRowAtIndex([row("a", "A", [])], 3, { label: "x" })).toBeNull()
    expect(updateRowAtIndex([row("a", "A", [])], -1, { label: "x" })).toBeNull()
  })
})

describe("mapRowAtIndex", () => {
  it("maps one row and keeps sibling identities", () => {
    const rows = [row("a", "A", []), row("b", "B", []), row("c", "C", [])]
    const next = mapRowAtIndex(rows, 0, (r) => ({ ...r, label: "A2" }))
    expect(next).not.toBeNull()
    expect(next![0].label).toBe("A2")
    expect(next![1]).toBe(rows[1])
    expect(next![2]).toBe(rows[2])
  })
})

describe("finalizeRowsPreservingIdentity", () => {
  it("keeps row identity when finalize returns the same reference", () => {
    const rows = [row("a", "A", []), row("b", "B", [])]
    const out = finalizeRowsPreservingIdentity(rows, (r) => r)
    expect(out[0]).toBe(rows[0])
    expect(out[1]).toBe(rows[1])
  })

  it("only replaces rows finalize mutates", () => {
    const rows = [row("a", "A", []), row("b", "B", [])]
    const out = finalizeRowsPreservingIdentity(rows, (r) =>
      r.id === "b" ? { ...r, label: "B2" } : r
    )
    expect(out[0]).toBe(rows[0])
    expect(out[1]).not.toBe(rows[1])
    expect(out[1].label).toBe("B2")
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
    expect(normalizeCalls).toBe(3)
    expect(first.rows).toHaveLength(3)

    // Simulate parent feeding normalized rows back after a single-row patch.
    const rows2 = mapRowAtIndex(first.rows, 1, (r) => ({ ...r, label: "B2" }))!
    normalizeCalls = 0
    const second = normalizeRowsPreservingIdentity(
      rows2,
      weekKeys,
      normalizeOne,
      first.cache
    )
    expect(normalizeCalls).toBe(1)
    expect(second.rows[0]).toBe(first.rows[0])
    expect(second.rows[2]).toBe(first.rows[2])
    expect(second.rows[1]).not.toBe(first.rows[1])
    expect(second.rows[1].label).toBe("B2")
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
    expect(calls).toBe(1)
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
    expect(builds).toBe(2)

    const rows2 = mapRowAtIndex(rows1, 0, (r) => ({
      ...r,
      label: "A2",
      // same spans reference → map should reuse
    }))!
    builds = 0
    const second = buildMapsPreservingIdentity(
      rows2,
      weekKeys,
      (r) => r.mergedWeekSpans,
      buildOne,
      first.cache
    )
    expect(builds).toBe(0)
    expect(second.maps[0]).toBe(first.maps[0])
    expect(second.maps[1]).toBe(first.maps[1])
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
    expect(next).not.toBeNull()
    let preserved = 0
    for (let i = 0; i < rows.length; i++) {
      if (next![i] === rows[i]) preserved++
    }
    expect(preserved).toBe(299)
    expect(next![150]).not.toBe(rows[150])
    // Sanity: array rebuild of 300 cheap objects stays well under 50ms on CI.
    expect(ms).toBeLessThan(50)
  })
})
