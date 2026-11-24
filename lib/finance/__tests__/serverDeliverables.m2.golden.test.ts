/**
 * M2 goldens: planned deliverables today (C-417), on the server paths and in
 * the editor, before `one_net_media` is threaded into them.
 *
 * Surfaces: the editor load (`computeLoadedDeliverables`), the campaign
 * financials per line (bursts, two bursts, no bursts), the ad serving total
 * the deliverables price, and the Excel explode rows.
 *
 * Fixtures: fee-inclusive lines at a rounding edge, where two float orders of
 * the same net media round to different counts (976.5, 563.5, 325.5), and two
 * live-sized lines that sit on no edge.
 *
 * With the switch off and no snapshot (the server today) these never move.
 */
import "@/lib/testing/bothZones"
import assert from "node:assert/strict"
import test from "node:test"

import { setClientFeatureSnapshot } from "@/lib/features/client"
import { computeCampaignFinancials } from "@/lib/finance/computeCampaignFinancials"

import {
  M1_PAIR_FIXTURES,
  M2_AD_SERVING,
  lineInputsFor,
  m2EditorCounts,
  m2ExplodeRows,
  m2LineInputs,
} from "./fixtures/m2Deliverables"

test("M2 golden: server planned deliverables today (no switch snapshot)", () => {
  setClientFeatureSnapshot(null)
  const f = computeCampaignFinancials(m2LineInputs(), { feeLoading: {} }, M2_AD_SERVING)
  assert.deepEqual(
    f.perLine.map((p) => [p.lineItemId, p.deliverables]),
    [["E1", 976], ["E2", 976], ["E3", 563], ["E4", 1301], ["R1", 38571], ["R2", 1797131]],
  )
  assert.equal(f.mbaScopeTotals.adServing, 563)

  const noBursts = computeCampaignFinancials([{ ...m2LineInputs()[0]!, lineItemId: "N1", bursts: [] }], { feeLoading: {} })
  assert.equal(noBursts.perLine[0]!.deliverables, 976)

  assert.deepEqual(m2ExplodeRows(), [[976], [976], [563], [325, 976], [38571], [1797131]])
})

test("M2 golden: the editor load counts today, switch off", () => {
  setClientFeatureSnapshot({ one_net_media: false })
  try {
    assert.deepEqual(m2EditorCounts(), [[976], [976], [563], [325, 976], [38571], [1797131]])
  } finally {
    setClientFeatureSnapshot(null)
  }
})

/** The M1 golden pairs at CPM $12.50: today's counts on all three paths. */
const M1_PAIR_COUNTS = [1080000, 1776989, 880076, 420004, 105000, 492880, 196954, 175000, 81234, 53335, 80000, 25, 378, 781, 1302, 21227]

test("M2 golden: the M1 pairs on the server, the explode and the editor today", () => {
  setClientFeatureSnapshot({ one_net_media: false })
  try {
    const f = computeCampaignFinancials(lineInputsFor(M1_PAIR_FIXTURES), { feeLoading: {} })
    assert.deepEqual(f.perLine.map((p) => p.deliverables), M1_PAIR_COUNTS)
    assert.deepEqual(m2ExplodeRows(M1_PAIR_FIXTURES).flat(), M1_PAIR_COUNTS)
    assert.deepEqual(m2EditorCounts(M1_PAIR_FIXTURES).flat(), M1_PAIR_COUNTS)
  } finally {
    setClientFeatureSnapshot(null)
  }
})
