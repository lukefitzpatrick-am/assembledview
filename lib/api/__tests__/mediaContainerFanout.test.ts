import assert from "node:assert/strict"
import test from "node:test"

import { mapMediaContainerFetches } from "@/lib/api/media-containers"

test("mapMediaContainerFetches: one channel throwing still yields the other 19", async () => {
  const mediaTypes = Array.from({ length: 20 }, (_, i) => `channel_${i}`)
  let calls = 0

  const results = await mapMediaContainerFetches(
    mediaTypes,
    async (mediaType) => {
      calls++
      if (mediaType === "channel_7") {
        throw new Error("simulated channel failure")
      }
      return [{ id: calls, mba_number: "TEST", media_plan_version: 1, channel: mediaType } as any]
    },
    4
  )

  assert.equal(results.length, 20)
  assert.equal(calls, 20)

  const failed = results.find((r) => r.mediaType === "channel_7")
  assert.ok(failed)
  assert.deepEqual(failed!.lineItems, [])

  const ok = results.filter((r) => r.mediaType !== "channel_7")
  assert.equal(ok.length, 19)
  for (const row of ok) {
    assert.equal(row.lineItems.length, 1)
    assert.equal((row.lineItems[0] as any).channel, row.mediaType)
  }
})

test("mapMediaContainerFetches: preserves order under bounded concurrency", async () => {
  const mediaTypes = ["a", "b", "c", "d", "e"]
  const results = await mapMediaContainerFetches(
    mediaTypes,
    async (mediaType) => {
      await new Promise((r) => setTimeout(r, mediaType === "a" ? 30 : 5))
      return [{ id: 1, mba_number: "X", media_plan_version: 1, channel: mediaType } as any]
    },
    2
  )
  assert.deepEqual(
    results.map((r) => r.mediaType),
    mediaTypes
  )
})
