import { describe, expect, it } from "vitest"

import {
  finalizeRowsPreservingIdentity,
  normalizeRowsPreservingIdentity,
  updateRowAtIndex,
} from "./expertGridRowPerf"

describe("F-28 Phase 1 microbench (recorded in commit)", () => {
  it("single-edit + normalize at 300×52 stays under 5ms avg", () => {
    const weekKeys = Object.freeze(
      Array.from({ length: 52 }, (_, i) => `2025-W${String(i + 1).padStart(2, "0")}`)
    )
    type R = {
      id: string
      label: string
      weeklyValues: Record<string, number | "">
      mergedWeekSpans: readonly unknown[]
    }
    const seed: R[] = Array.from({ length: 300 }, (_, i) => ({
      id: `r${i}`,
      label: `L${i}`,
      weeklyValues: Object.fromEntries(weekKeys.map((k) => [k, "" as const])),
      mergedWeekSpans: [],
    }))
    const normalizeOne = (r: R, keys: readonly string[]): R => {
      const weeklyValues: Record<string, number | ""> = {}
      for (const k of keys) weeklyValues[k] = r.weeklyValues[k] ?? ""
      return { ...r, weeklyValues, mergedWeekSpans: r.mergedWeekSpans ?? [] }
    }

    let cache = new Map()
    let { rows, cache: c1 } = normalizeRowsPreservingIdentity(
      seed,
      weekKeys,
      normalizeOne,
      cache
    )
    cache = c1

    const t0 = performance.now()
    for (let n = 0; n < 50; n++) {
      const patched = updateRowAtIndex(rows, n % 300, { label: `x${n}` })!
      const finalized = finalizeRowsPreservingIdentity(patched, (r) => r)
      const next = normalizeRowsPreservingIdentity(
        finalized,
        weekKeys,
        normalizeOne,
        cache
      )
      rows = next.rows
      cache = next.cache
    }
    const avgEditMs = (performance.now() - t0) / 50

    const t1 = performance.now()
    const withAdds = [
      ...rows,
      ...Array.from({ length: 100 }, (_, i) => ({
        ...rows[0]!,
        id: `new${i}`,
        label: `N${i}`,
      })),
    ]
    const afterAdd = normalizeRowsPreservingIdentity(
      finalizeRowsPreservingIdentity(withAdds, (r) => r),
      weekKeys,
      normalizeOne,
      cache
    )
    const add100Ms = performance.now() - t1

    // eslint-disable-next-line no-console
    console.log(
      `[F-28 OOH Phase1 bench] avgSingleEdit_ms=${avgEditMs.toFixed(3)} add100_ms=${add100Ms.toFixed(2)} rows=${afterAdd.rows.length}`
    )

    expect(avgEditMs).toBeLessThan(5)
    expect(add100Ms).toBeLessThan(50)
    expect(afterAdd.rows.length).toBe(400)
  })
})
