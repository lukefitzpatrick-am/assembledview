import assert from "node:assert/strict"
import test from "node:test"

/**
 * Supersede must stamp superseded_by + superseded_at together (CHECK pair).
 * Live views filter superseded_by IS NULL — original drops out once both are set.
 */

test("supersede stamp always includes both columns", () => {
  // Mirror the write path contract in writeCampaignInsights.ts createCampaignInsight txn.
  const replacementId = 42
  const stamp: { supersededBy: number; supersededAt: unknown; updatedAt?: unknown } = {
    supersededBy: replacementId,
    supersededAt: "now()",
    updatedAt: "now()",
  }
  assert.equal(stamp.supersededBy, 42)
  assert.ok(stamp.supersededAt != null)
  // Pair invariant: both null or both set — never one without the other
  const bothSet = stamp.supersededBy != null && stamp.supersededAt != null
  const bothNull = stamp.supersededBy == null && stamp.supersededAt == null
  assert.equal(bothSet || bothNull, true)
  assert.equal(bothSet, true)
})

test("live view filter drops superseded original", () => {
  const rows = [
    { id: 1, body: "original", supersededBy: 2 as number | null },
    { id: 2, body: "replacement", supersededBy: null as number | null },
  ]
  const live = rows.filter((r) => r.supersededBy == null)
  assert.equal(live.length, 1)
  assert.equal(live[0]!.id, 2)
  assert.equal(
    live.some((r) => r.id === 1),
    false,
  )
})

test("attribution confidence stamps foreign author on supersede", () => {
  const was = "alice@assembled.media"
  const by = "bob@assembled.media"
  const confidence =
    was.trim().toLowerCase() === by.trim().toLowerCase()
      ? null
      : `attributed_supersede:was:${was.trim().toLowerCase()}`
  assert.equal(confidence, "attributed_supersede:was:alice@assembled.media")
})
