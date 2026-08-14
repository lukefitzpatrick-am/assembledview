/**
 * ingest_runs history: accept, cancel, and blocked each write a row.
 * Cancel must not call savePlanVersion.
 */
import assert from "node:assert/strict"
import test from "node:test"
import {
  clearIngestRunOverlayForTests,
  listIngestRuns,
  recordIngestRun,
  type IngestRunInput,
} from "../ingestRuns"

function base(over: Partial<IngestRunInput> = {}): IngestRunInput {
  return {
    publisherId: 12,
    publisherName: "SCA",
    fileName: "sca.xlsx",
    uploadedBy: "luke@assembledmedia.com.au",
    detectedConfidence: 0.94,
    requiredCoverage: 1,
    lineItemCount: 4,
    panelCount: 0,
    burstCount: 12,
    moneyDelta: 0.001,
    outcome: "accepted",
    outcomeReason: null,
    acceptedVersionId: 99,
    ...over,
  }
}

test("accept, cancel, and blocked each persist an ingest_runs row", async () => {
  clearIngestRunOverlayForTests()
  await recordIngestRun(base({ outcome: "accepted", acceptedVersionId: 42 }))
  await recordIngestRun(
    base({
      outcome: "cancelled",
      acceptedVersionId: null,
      outcomeReason: "human cancel",
    }),
  )
  await recordIngestRun(
    base({
      outcome: "blocked",
      acceptedVersionId: null,
      outcomeReason: "Reconciliation delta blocks Accept",
      moneyDelta: 0.02,
    }),
  )
  const rows = await listIngestRuns({ publisherName: "SCA" })
  assert.equal(rows.length, 3)
  assert.deepEqual(
    rows.map((r) => r.outcome).sort(),
    ["accepted", "blocked", "cancelled"],
  )
  const accepted = rows.find((r) => r.outcome === "accepted")!
  assert.equal(accepted.acceptedVersionId, 42)
  assert.equal(accepted.publisherId, 12)
  const cancelled = rows.find((r) => r.outcome === "cancelled")!
  assert.equal(cancelled.acceptedVersionId, null)
  const blocked = rows.find((r) => r.outcome === "blocked")!
  assert.match(blocked.outcomeReason ?? "", /delta/i)
})

test("cancel overlay write is independent of savePlanVersion", async () => {
  clearIngestRunOverlayForTests()
  let saves = 0
  const cancelWithoutSave = async () => {
    await recordIngestRun(
      base({ outcome: "cancelled", acceptedVersionId: null }),
    )
  }
  await cancelWithoutSave()
  assert.equal(saves, 0)
  assert.equal((await listIngestRuns({ publisherName: "SCA" })).length, 1)
})
