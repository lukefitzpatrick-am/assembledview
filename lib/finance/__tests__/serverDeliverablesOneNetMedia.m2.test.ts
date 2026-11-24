/**
 * M2 (C-417): server planned deliverables take `one_net_media` from the caller.
 *
 * - What moves with the switch on: counts at a rounding edge (976.5, 563.5,
 *   325.5) go up by one, and the ad serving those counts price moves $1.
 *   Live-sized lines and the M1 pairs do not move.
 * - A passed value wins over the browser snapshot both ways; unset follows
 *   the snapshot (the editor's read).
 * - The server and the editor agree, burst by burst, with the switch on and off.
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

const OFF = [["E1", 976], ["E2", 976], ["E3", 563], ["E4", 1301], ["R1", 38571], ["R2", 1797131]]
const ON = [["E1", 977], ["E2", 977], ["E3", 564], ["E4", 1303], ["R1", 38571], ["R2", 1797131]]

function server(oneNetMedia: boolean | undefined) {
  const f = computeCampaignFinancials(m2LineInputs(), { feeLoading: {} }, { ...M2_AD_SERVING, oneNetMedia })
  return { perLine: f.perLine.map((p) => [p.lineItemId, p.deliverables]), adServing: f.mbaScopeTotals.adServing }
}

function withSnapshot<T>(on: boolean | null, fn: () => T): T {
  setClientFeatureSnapshot(on === null ? null : { one_net_media: on })
  try {
    return fn()
  } finally {
    setClientFeatureSnapshot(null)
  }
}

test("switch on: edge counts move up by one and the ad serving they price moves $1", () => {
  withSnapshot(null, () => {
    assert.deepEqual(server(true), { perLine: ON, adServing: 564 })
    assert.deepEqual(server(false), { perLine: OFF, adServing: 563 })
    const noBursts = (oneNetMedia: boolean) =>
      computeCampaignFinancials([{ ...m2LineInputs()[0]!, lineItemId: "N1", bursts: [] }], { feeLoading: {} }, { oneNetMedia })
        .perLine[0]!.deliverables
    assert.equal(noBursts(true), 977)
    assert.equal(noBursts(false), 976)
    assert.deepEqual(m2ExplodeRows(undefined, { oneNetMedia: true }), [[977], [977], [564], [326, 977], [38571], [1797131]])
    assert.deepEqual(m2ExplodeRows(undefined, { oneNetMedia: false }), [[976], [976], [563], [325, 976], [38571], [1797131]])
  })
})

test("switch on: a two-burst display line prices each burst's edge count in ad serving", () => {
  // 0.35 and 1.05 at 7%, CPM $1: 325.5 and 976.5 impressions, one burst each.
  const line = { ...m2LineInputs()[3]!, lineItemId: "E5", mediaType: "digidisplay" }
  const adServing = (oneNetMedia: boolean) =>
    computeCampaignFinancials([line], { feeLoading: {} }, { ...M2_AD_SERVING, oneNetMedia }).mbaScopeTotals.adServing
  withSnapshot(null, () => {
    assert.equal(adServing(true), 1303)
    assert.equal(adServing(false), 1301)
  })
})

test("a passed value wins over the snapshot; unset follows it", () => {
  withSnapshot(true, () => {
    assert.deepEqual(server(false).perLine, OFF)
    assert.deepEqual(server(undefined).perLine, ON)
    assert.deepEqual(m2ExplodeRows(undefined, { oneNetMedia: false })[0], [976])
    assert.deepEqual(m2ExplodeRows()[0], [977])
  })
  withSnapshot(false, () => {
    assert.deepEqual(server(true).perLine, ON)
    assert.deepEqual(server(undefined).perLine, OFF)
  })
})

test("the server and the editor agree, burst by burst, on and off", () => {
  for (const on of [true, false]) {
    for (const fixtures of [undefined, M1_PAIR_FIXTURES] as const) {
      const editor = withSnapshot(on, () => m2EditorCounts(fixtures))
      const inputs = fixtures ? lineInputsFor(fixtures) : m2LineInputs()
      const serverLines = withSnapshot(null, () =>
        computeCampaignFinancials(inputs, { feeLoading: {} }, { oneNetMedia: on }).perLine.map((p) => p.deliverables),
      )
      const explode = withSnapshot(null, () => m2ExplodeRows(fixtures, { oneNetMedia: on }))
      assert.deepEqual(explode, editor, `explode, switch ${on}`)
      assert.deepEqual(serverLines, editor.map((bursts) => bursts.reduce((a, b) => a + b, 0)), `financials, switch ${on}`)
    }
  }
})
