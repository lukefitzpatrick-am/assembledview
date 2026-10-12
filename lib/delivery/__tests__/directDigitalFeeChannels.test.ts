import assert from "node:assert/strict"
import test from "node:test"

import {
  feeChannelsFromLoading,
  feeLoadingFromSnapshot,
  feePctsByVersionFromSnapshots,
} from "../directDigitalFeeChannels"

test("fees JSON keys the four direct-digital channels", () => {
  const fees = feeLoadingFromSnapshot({
    feedigidisplay: 15,
    feedigivideo: "10",
    feedigiaudio: 8,
    feebvod: 12,
    feesearch: 5,
  })
  assert.ok(fees)
  const channels = feeChannelsFromLoading(fees)
  assert.equal(channels["digital-display"], 15)
  assert.equal(channels["digital-video"], 10)
  assert.equal(channels["digital-audio"], 8)
  assert.equal(channels.bvod, 12)
})

test("a missing snapshot row is omitted unless client fee loading is already in hand", () => {
  const missing = feePctsByVersionFromSnapshots({
    versionIds: [7],
    snapshots: new Map(),
  })
  assert.equal(missing["7"], undefined)

  const fromClient = feePctsByVersionFromSnapshots({
    versionIds: [7],
    snapshots: new Map(),
    clientFeeLoading: { feedigidisplay: 15 },
  })
  assert.equal(fromClient["7"]?.["digital-display"], 15)

  const fromSnapshot = feePctsByVersionFromSnapshots({
    versionIds: [7],
    snapshots: new Map([[7, { feedigidisplay: 15 }]]),
    clientFeeLoading: { feedigidisplay: 99 },
  })
  assert.equal(fromSnapshot["7"]?.["digital-display"], 15)
})
