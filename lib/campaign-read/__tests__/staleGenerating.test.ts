import assert from "node:assert/strict"
import test from "node:test"

import {
  GENERATING_STALE_ERROR,
  applyStaleGeneratingFailure,
} from "../stale.js"

test("stuck generating older than 10 minutes flips to failed Timed out", () => {
  const nowMs = Date.parse("2026-09-17T00:20:00.000Z")
  const row = {
    id: 1,
    mbaNumber: "BICAU002",
    versionNumber: 28,
    status: "generating" as const,
    generatedAt: "2026-09-17T00:00:00.000Z",
    errorMessage: null as string | null,
  }

  const next = applyStaleGeneratingFailure(row, nowMs)

  assert.equal(next.status, "failed")
  assert.equal(next.errorMessage, GENERATING_STALE_ERROR)
  assert.equal(next.errorMessage, "Timed out")
  assert.equal(next.id, 1)
})

test("generating younger than 10 minutes stays generating", () => {
  const nowMs = Date.parse("2026-09-17T00:05:00.000Z")
  const row = {
    id: 2,
    status: "generating" as const,
    generatedAt: "2026-09-17T00:00:00.000Z",
    errorMessage: null as string | null,
  }

  const next = applyStaleGeneratingFailure(row, nowMs)

  assert.equal(next.status, "generating")
  assert.equal(next.errorMessage, null)
})
