import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { boundedMap } from "@/lib/utils/boundedMap"

describe("boundedMap", () => {
  it("preserves input order in results", async () => {
    const items = [1, 2, 3, 4, 5]
    const results = await boundedMap(
      items,
      async (n) => {
        await new Promise((r) => setTimeout(r, (6 - n) * 5))
        return n * 10
      },
      2
    )
    assert.deepEqual(results, [10, 20, 30, 40, 50])
  })

  it("limits concurrent in-flight work", async () => {
    let inFlight = 0
    let maxInFlight = 0
    const items = Array.from({ length: 12 }, (_, i) => i)

    await boundedMap(
      items,
      async () => {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise((r) => setTimeout(r, 20))
        inFlight--
      },
      3
    )

    assert.equal(maxInFlight, 3)
  })

  it("rejects on first error and does not hang", async () => {
    const items = [1, 2, 3, 4]
    await assert.rejects(
      () =>
        boundedMap(
          items,
          async (n) => {
            if (n === 2) throw new Error("boom")
            await new Promise((r) => setTimeout(r, 30))
            return n
          },
          2
        ),
      /boom/
    )
  })

  it("returns empty array for empty input", async () => {
    const results = await boundedMap([], async () => 1, 4)
    assert.deepEqual(results, [])
  })

  it("treats concurrency <= 0 as 1", async () => {
    let inFlight = 0
    let maxInFlight = 0
    await boundedMap(
      [1, 2, 3],
      async () => {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise((r) => setTimeout(r, 10))
        inFlight--
      },
      0
    )
    assert.equal(maxInFlight, 1)
  })
})
