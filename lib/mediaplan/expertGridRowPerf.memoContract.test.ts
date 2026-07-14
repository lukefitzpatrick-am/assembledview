import { describe, expect, it } from "vitest"

import {
  buildMapsPreservingIdentity,
  finalizeRowsPreservingIdentity,
  mapRowAtIndex,
  normalizeRowsPreservingIdentity,
  updateRowAtIndex,
} from "./expertGridRowPerf"

/**
 * Documents the MemoExpertGridRow contract: sibling updates must not disturb
 * other row object identities (so custom memo compare can skip them).
 */
describe("F-28 row identity contract for memo skips", () => {
  it("edit → normalize → finalize leaves 299/300 row identities intact", () => {
    const weekKeys = Object.freeze(
      Array.from({ length: 52 }, (_, i) => `2025-W${String(i + 1).padStart(2, "0")}`)
    )
    type R = {
      id: string
      label: string
      weeklyValues: Record<string, number | "">
      mergedWeekSpans: readonly unknown[]
      startDate: string
      endDate: string
    }
    const seed: R[] = Array.from({ length: 300 }, (_, i) => ({
      id: `r${i}`,
      label: `L${i}`,
      weeklyValues: Object.fromEntries(weekKeys.map((k) => [k, "" as const])),
      mergedWeekSpans: [],
      startDate: "2025-01-01",
      endDate: "2025-12-31",
    }))

    const normCache = new Map()
    const mapsCache = new Map()
    const normalizeOne = (r: R, keys: readonly string[]): R => {
      const weeklyValues: Record<string, number | ""> = {}
      for (const k of keys) weeklyValues[k] = r.weeklyValues[k] ?? ""
      return { ...r, weeklyValues, mergedWeekSpans: r.mergedWeekSpans ?? [] }
    }

    const firstNorm = normalizeRowsPreservingIdentity(
      seed,
      weekKeys,
      normalizeOne,
      normCache
    )
    const firstMaps = buildMapsPreservingIdentity(
      firstNorm.rows,
      weekKeys,
      (r) => r.mergedWeekSpans,
      (r) => ({ id: r.id }),
      mapsCache
    )

    const patched = updateRowAtIndex(firstNorm.rows, 42, {
      label: "edited",
    })!
    const finalized = finalizeRowsPreservingIdentity(patched, (r) => {
      // unchanged rows: identity; edited row: same dates → keep post-patch ref
      return r
    })
    const secondNorm = normalizeRowsPreservingIdentity(
      finalized,
      weekKeys,
      normalizeOne,
      firstNorm.cache
    )
    const secondMaps = buildMapsPreservingIdentity(
      secondNorm.rows,
      weekKeys,
      (r) => r.mergedWeekSpans,
      (r) => ({ id: r.id }),
      firstMaps.cache
    )

    let sameRow = 0
    let sameMap = 0
    for (let i = 0; i < 300; i++) {
      if (secondNorm.rows[i] === firstNorm.rows[i]) sameRow++
      if (secondMaps.maps[i] === firstMaps.maps[i]) sameMap++
    }
    expect(sameRow).toBe(299)
    expect(sameMap).toBe(300)
    expect(secondNorm.rows[42]?.label).toBe("edited")
  })

  it("mapRowAtIndex then finalize only rematerialises the changed index", () => {
    const rows = [
      { id: "a", n: 1 },
      { id: "b", n: 2 },
      { id: "c", n: 3 },
    ]
    const mapped = mapRowAtIndex(rows, 1, (r) => ({ ...r, n: 99 }))!
    const out = finalizeRowsPreservingIdentity(mapped, (r) =>
      r.n === 99 ? { ...r, n: 100 } : r
    )
    expect(out[0]).toBe(rows[0])
    expect(out[2]).toBe(rows[2])
    expect(out[1]).toEqual({ id: "b", n: 100 })
  })

  it("Radio-shaped rows: single edit preserves ≥ N-1 identities through normalize/finalize", () => {
    const weekKeys = Object.freeze(
      Array.from({ length: 52 }, (_, i) => `2025-W${String(i + 1).padStart(2, "0")}`)
    )
    type RadioLike = {
      id: string
      weeklyValues: Record<string, number | "">
      mergedWeekSpans: readonly unknown[]
      startDate: string
      endDate: string
      network: string
      station: string
    }
    const seed: RadioLike[] = Array.from({ length: 300 }, (_, i) => ({
      id: `radio-${i}`,
      weeklyValues: Object.fromEntries(weekKeys.map((k) => [k, "" as const])),
      mergedWeekSpans: [],
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      network: `Net ${i % 5}`,
      station: `Station ${i % 10}`,
    }))

    const normCache = new Map()
    const mapsCache = new Map()
    const normalizeOne = (r: RadioLike, keys: readonly string[]): RadioLike => {
      const weeklyValues: Record<string, number | ""> = {}
      for (const k of keys) weeklyValues[k] = r.weeklyValues[k] ?? ""
      return {
        ...r,
        weeklyValues,
        mergedWeekSpans: r.mergedWeekSpans ?? [],
      }
    }

    const firstNorm = normalizeRowsPreservingIdentity(
      seed,
      weekKeys,
      normalizeOne,
      normCache
    )
    const firstMaps = buildMapsPreservingIdentity(
      firstNorm.rows,
      weekKeys,
      (r) => r.mergedWeekSpans,
      (r) => ({ id: r.id }),
      mapsCache
    )

    const patched = updateRowAtIndex(firstNorm.rows, 17, {
      network: "Edited Network",
      station: "Edited Station",
    })!
    const finalized = finalizeRowsPreservingIdentity(patched, (r) => r)
    const secondNorm = normalizeRowsPreservingIdentity(
      finalized,
      weekKeys,
      normalizeOne,
      firstNorm.cache
    )
    const secondMaps = buildMapsPreservingIdentity(
      secondNorm.rows,
      weekKeys,
      (r) => r.mergedWeekSpans,
      (r) => ({ id: r.id }),
      firstMaps.cache
    )

    let sameRow = 0
    let sameMap = 0
    for (let i = 0; i < 300; i++) {
      if (secondNorm.rows[i] === firstNorm.rows[i]) sameRow++
      if (secondMaps.maps[i] === firstMaps.maps[i]) sameMap++
    }
    expect(sameRow).toBeGreaterThanOrEqual(299)
    expect(sameMap).toBe(300)
    expect(secondNorm.rows[17]?.network).toBe("Edited Network")
    expect(secondNorm.rows[17]?.station).toBe("Edited Station")
  })
})
