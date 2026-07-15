import assert from "node:assert/strict"
import test from "node:test"

import {
  EXPERT_BULK_ADD_CHUNK_THRESHOLD,
  appendRowsInChunks,
  bulkAddChunkPlan,
  clampBulkAddCount,
} from "@/lib/mediaplan/chunkedBulkAdd"

test("clampBulkAddCount respects 1..500", () => {
  assert.equal(clampBulkAddCount("0"), 1)
  assert.equal(clampBulkAddCount("250"), 250)
  assert.equal(clampBulkAddCount("999"), 500)
  assert.equal(clampBulkAddCount(""), 1)
})

test("bulkAddChunkPlan: small N is a single chunk", () => {
  const plan = bulkAddChunkPlan(10)
  assert.equal(plan.useChunking, false)
  assert.equal(plan.chunkCount, 1)
  assert.equal(plan.chunkSize, 10)
})

test("bulkAddChunkPlan: large N splits across frames", () => {
  const plan = bulkAddChunkPlan(EXPERT_BULK_ADD_CHUNK_THRESHOLD)
  assert.equal(plan.useChunking, true)
  assert.ok(plan.chunkCount > 1)
})

test("appendRowsInChunks: chunked path yields and ends at N", async () => {
  const pushes: number[] = []
  const yields: number[] = []
  let yieldCount = 0
  const final = await appendRowsInChunks({
    existing: ["a"],
    totalToAdd: 60,
    createRows: (offset, count) =>
      Array.from({ length: count }, (_, i) => `r${offset + i}`),
    pushRows: (rows) => pushes.push(rows.length),
    onProgress: (done, total) => {
      assert.ok(done <= total)
    },
    chunkSize: 25,
    threshold: 40,
    yieldFrame: async () => {
      yieldCount += 1
      yields.push(yieldCount)
    },
  })
  assert.equal(final.length, 61)
  assert.ok(pushes.length >= 2, `expected multiple pushes, got ${pushes.length}`)
  assert.equal(pushes[pushes.length - 1], 61)
  assert.ok(yieldCount >= 1)
})

test("appendRowsInChunks: small N is one synchronous push", async () => {
  const pushes: number[] = []
  let yields = 0
  await appendRowsInChunks({
    existing: [],
    totalToAdd: 5,
    createRows: (offset, count) =>
      Array.from({ length: count }, (_, i) => offset + i),
    pushRows: (rows) => pushes.push(rows.length),
    yieldFrame: async () => {
      yields += 1
    },
  })
  assert.deepEqual(pushes, [5])
  assert.equal(yields, 0)
})
