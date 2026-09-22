import assert from "node:assert/strict"
import test from "node:test"

import { compareRelabelMap } from "../drift.js"

/** Pre-feature 15 Sep Meta map row — no delivery_relabels row. */
const BICAU_SM2_MAP = {
  channel: "Social - Meta",
  platformLineItemId: "120256089860390550",
  lineItemId: "bicau002sm2",
  mbaNumber: "bicau002",
}

/** Pre-feature 18 Aug BIC CM360 map rows — no delivery_relabels row. */
const BIC_AUG_MAPS = [
  {
    channel: "Ad Serving - CM360",
    platformLineItemId: "BIC_ALWAYS_ON_ROS",
    lineItemId: "bicau002dv1",
    mbaNumber: "bicau002",
  },
  {
    channel: "Ad Serving - CM360",
    platformLineItemId: "BIC_ALWAYS_ON_PREROLL",
    lineItemId: "bicau002dv2",
    mbaNumber: "bicau002",
  },
]

function applied(partial: {
  id: number
  channel: string
  platformEntityId: string
  toLineItemId: string
  mbaNumber?: string
}) {
  return {
    id: partial.id,
    channel: partial.channel,
    platformEntityId: partial.platformEntityId,
    toLineItemId: partial.toLineItemId,
    mbaNumber: partial.mbaNumber ?? "bicau002",
    status: "applied" as const,
  }
}

test("15 Sep bicau002sm2 and 18 Aug BIC map rows with no relabel are legacy", () => {
  const result = compareRelabelMap([BICAU_SM2_MAP, ...BIC_AUG_MAPS], [])
  assert.equal(result.legacy.length, 3)
  assert.equal(result.drift.length, 0)
  assert.deepEqual(
    result.legacy.map((row) => row.platformEntityId).sort(),
    ["120256089860390550", "BIC_ALWAYS_ON_PREROLL", "BIC_ALWAYS_ON_ROS"].sort(),
  )
  assert.ok(result.legacy.every((row) => row.kind === "legacy"))
})

test("applied relabel whose map row is missing is drift", () => {
  const result = compareRelabelMap(
    [BICAU_SM2_MAP],
    [
      applied({
        id: 12,
        channel: "Social - Meta",
        platformEntityId: "999999999",
        toLineItemId: "bicau002sm3",
      }),
    ],
  )
  assert.equal(result.drift.length, 1)
  assert.equal(result.drift[0]?.kind, "drift")
  assert.equal(result.drift[0]?.relabelId, 12)
  assert.equal(result.drift[0]?.platformEntityId, "999999999")
  assert.match(result.drift[0]?.message ?? "", /missing/i)
  assert.ok(result.legacy.some((row) => row.platformEntityId === "120256089860390550"))
})

test("applied relabel whose map row points elsewhere is drift", () => {
  const result = compareRelabelMap(
    [
      {
        channel: "Social - Meta",
        platformLineItemId: "120256089860390550",
        lineItemId: "bicau002sm1",
        mbaNumber: "bicau002",
      },
    ],
    [
      applied({
        id: 7,
        channel: "Social - Meta",
        platformEntityId: "120256089860390550",
        toLineItemId: "bicau002sm2",
      }),
    ],
  )
  assert.equal(result.legacy.length, 0)
  assert.equal(result.drift.length, 1)
  assert.equal(result.drift[0]?.kind, "drift")
  assert.equal(result.drift[0]?.mapLineItemId, "bicau002sm1")
  assert.equal(result.drift[0]?.relabelLineItemId, "bicau002sm2")
  assert.match(result.drift[0]?.message ?? "", /elsewhere|points|mismatch/i)
})

test("matching applied relabel and map row is neither legacy nor drift", () => {
  const result = compareRelabelMap(
    [BICAU_SM2_MAP],
    [
      applied({
        id: 7,
        channel: "Social - Meta",
        platformEntityId: "120256089860390550",
        toLineItemId: "bicau002sm2",
      }),
    ],
  )
  assert.equal(result.legacy.length, 0)
  assert.equal(result.drift.length, 0)
  assert.equal(result.findings.length, 0)
})
