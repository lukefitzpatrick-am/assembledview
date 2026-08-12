import assert from "node:assert/strict"
import test from "node:test"

import {
  canEditInPlace,
  INSIGHT_EDIT_WINDOW_MS,
  wouldCreateSupersedeCycle,
} from "../writeCampaignInsights.js"

test("wouldCreateSupersedeCycle refuses A → B → A", async () => {
  // Existing: A.superseded_by = B. Attempt: B.superseded_by = A
  const chain = new Map<number, number | null>([
    [1, 2], // A → B
    [2, null], // B live
  ])
  const cycles = await wouldCreateSupersedeCycle(2, 1, {
    getSupersededBy: async (id) => (chain.has(id) ? chain.get(id)! : null),
  })
  assert.equal(cycles, true)
})

test("wouldCreateSupersedeCycle refuses longer A → B → C → A", async () => {
  const chain = new Map<number, number | null>([
    [1, 2],
    [2, 3],
    [3, null],
  ])
  const cycles = await wouldCreateSupersedeCycle(3, 1, {
    getSupersededBy: async (id) => (chain.has(id) ? chain.get(id)! : null),
  })
  assert.equal(cycles, true)
})

test("wouldCreateSupersedeCycle allows acyclic replacement", async () => {
  const chain = new Map<number, number | null>([
    [1, null],
    [2, null],
  ])
  const cycles = await wouldCreateSupersedeCycle(1, 2, {
    getSupersededBy: async (id) => (chain.has(id) ? chain.get(id)! : null),
  })
  assert.equal(cycles, false)
})

test("wouldCreateSupersedeCycle refuses self link", async () => {
  assert.equal(await wouldCreateSupersedeCycle(5, 5), true)
})

test("canEditInPlace — own + inside window", () => {
  const now = Date.parse("2026-08-11T12:00:00Z")
  assert.equal(
    canEditInPlace(
      {
        createdBy: "planner@assembled.media",
        createdAt: "2026-08-11T11:00:00Z",
        supersededBy: null,
      },
      "planner@assembled.media",
      now,
    ),
    true,
  )
})

test("canEditInPlace — false after window (must supersede)", () => {
  const createdAt = "2026-08-01T00:00:00Z"
  const now = Date.parse(createdAt) + INSIGHT_EDIT_WINDOW_MS + 1
  assert.equal(
    canEditInPlace(
      {
        createdBy: "planner@assembled.media",
        createdAt,
        supersededBy: null,
      },
      "planner@assembled.media",
      now,
    ),
    false,
  )
})

test("canEditInPlace — never rewrite someone else's insight in place", () => {
  assert.equal(
    canEditInPlace(
      {
        createdBy: "alice@assembled.media",
        createdAt: new Date().toISOString(),
        supersededBy: null,
      },
      "bob@assembled.media",
    ),
    false,
  )
})
