import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  LINE_ITEM_WRITE_CONCURRENCY,
  createSemaphore,
  lineItemWriteSemaphore,
} from "@/lib/utils/createSemaphore"

describe("createSemaphore", () => {
  it("limits concurrent in-flight work to the given capacity", async () => {
    const sem = createSemaphore(3)
    let inFlight = 0
    let maxInFlight = 0

    await Promise.all(
      Array.from({ length: 12 }, () =>
        sem.run(async () => {
          inFlight++
          maxInFlight = Math.max(maxInFlight, inFlight)
          await new Promise((r) => setTimeout(r, 20))
          inFlight--
        }),
      ),
    )

    assert.equal(maxInFlight, 3)
  })

  it("propagates rejections and still releases the permit", async () => {
    const sem = createSemaphore(1)
    let secondRan = false

    await assert.rejects(
      () =>
        sem.run(async () => {
          throw new Error("boom")
        }),
      /boom/,
    )

    await sem.run(async () => {
      secondRan = true
    })

    assert.equal(secondRan, true)
  })

  it("treats concurrency <= 0 as 1", async () => {
    const sem = createSemaphore(0)
    let inFlight = 0
    let maxInFlight = 0

    await Promise.all(
      [1, 2, 3].map(() =>
        sem.run(async () => {
          inFlight++
          maxInFlight = Math.max(maxInFlight, inFlight)
          await new Promise((r) => setTimeout(r, 10))
          inFlight--
        }),
      ),
    )

    assert.equal(maxInFlight, 1)
  })
})

describe("lineItemWriteSemaphore (shared across channels)", () => {
  it("caps LINE_ITEM_WRITE_CONCURRENCY at 4", () => {
    assert.equal(LINE_ITEM_WRITE_CONCURRENCY, 4)
  })

  it("keeps max in-flight <= 4 across 3 parallel channel-style fan-outs", async () => {
    let inFlight = 0
    let maxInFlight = 0
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

    async function saveChannel(channel: string, count: number): Promise<string[]> {
      const results = await Promise.all(
        Array.from({ length: count }, (_, i) =>
          lineItemWriteSemaphore.run(async () => {
            inFlight++
            maxInFlight = Math.max(maxInFlight, inFlight)
            await delay(15)
            inFlight--
            return `${channel}-${i}`
          }),
        ),
      )
      return results
    }

    const [tv, search, social] = await Promise.all([
      saveChannel("tv", 10),
      saveChannel("search", 10),
      saveChannel("social", 10),
    ])

    assert.ok(maxInFlight <= 4, `expected maxInFlight <= 4, got ${maxInFlight}`)
    assert.equal(maxInFlight, 4)
    assert.deepEqual(
      tv,
      Array.from({ length: 10 }, (_, i) => `tv-${i}`),
    )
    assert.deepEqual(
      search,
      Array.from({ length: 10 }, (_, i) => `search-${i}`),
    )
    assert.deepEqual(
      social,
      Array.from({ length: 10 }, (_, i) => `social-${i}`),
    )
  })
})
