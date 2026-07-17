import assert from "node:assert/strict"
import test from "node:test"
import { CREATE_MEDIA_TOGGLE_KEYS } from "../../mediaplan/createMediaToggleKeys.js"
import { PLANNING_CHANNEL_BENCH } from "../planningChannelBench.js"
import {
  ENGINE_TO_MP,
  UNMAPPED_MP_KEY,
  mapEngineSplitToCreateTargets,
  normalizeFrozenCreateTargets,
  MP_KEY_ORDER,
} from "../mapEngineSplitToCreateTargets.js"

test("ENGINE_TO_MP is total over PLANNING_CHANNEL_BENCH keys", () => {
  for (const id of Object.keys(PLANNING_CHANNEL_BENCH)) {
    assert.ok(id in ENGINE_TO_MP, `missing map entry: ${id}`)
  }
  assert.equal(ENGINE_TO_MP.digital_other, UNMAPPED_MP_KEY)
})

test("MP_KEY_ORDER matches create form media-type toggles", () => {
  assert.deepEqual([...MP_KEY_ORDER], [...CREATE_MEDIA_TOGGLE_KEYS])
})

test("facebook+instagram collapse; sum targets === campaign_budget", () => {
  const { campaign_budget, create_targets } = mapEngineSplitToCreateTargets(
    [
      { engine_channel_id: "facebook", pct: 40, dollars: 40_000 },
      { engine_channel_id: "instagram", pct: 60, dollars: 60_000 },
    ],
    { campaignBudget: 100_000 }
  )
  assert.equal(campaign_budget, 100_000)
  const social = create_targets.find((t) => t.mp_key === "mp_socialmedia")
  assert.ok(social)
  const sum = create_targets.reduce((s, t) => s + t.dollars, 0)
  assert.equal(sum, 100_000)
})

test("unknown engine and digital_other go to unmapped; residual never sinks there", () => {
  const { create_targets } = mapEngineSplitToCreateTargets(
    [
      { engine_channel_id: "tv", pct: 50, dollars: 49_500 },
      { engine_channel_id: "digital_other", pct: 25, dollars: 25_000 },
      { engine_channel_id: "future_x", pct: 25, dollars: 25_000 },
    ],
    { campaignBudget: 100_000 }
  )
  const unmapped = create_targets.find((t) => t.mp_key === UNMAPPED_MP_KEY)
  const tv = create_targets.find((t) => t.mp_key === "mp_television")
  assert.ok(unmapped && unmapped.dollars === 50_000)
  assert.ok(tv && tv.dollars === 50_000)
  const sum = create_targets.reduce((s, t) => s + t.dollars, 0)
  assert.equal(sum, 100_000)
})

test("negative residual does not drive a small mapped bucket below zero", () => {
  const { create_targets, campaign_budget } = mapEngineSplitToCreateTargets(
    [
      { engine_channel_id: "tv", pct: 10, dollars: 1_000 },
      { engine_channel_id: "radio", pct: 90, dollars: 100_000 },
    ],
    { campaignBudget: 100_000 }
  )
  assert.equal(campaign_budget, 100_000)
  for (const t of create_targets) {
    assert.ok(t.dollars >= 0, `${t.mp_key} went negative`)
  }
  assert.equal(
    create_targets.reduce((s, t) => s + t.dollars, 0),
    100_000
  )
})

test("stale frozen mp_key folds into unmapped without dropping dollars", () => {
  const known = new Set<string>([...CREATE_MEDIA_TOGGLE_KEYS])
  const { create_targets, campaign_budget } = normalizeFrozenCreateTargets(
    [
      { mp_key: "mp_socialmedia", dollars: 70_000, pct: 70 },
      { mp_key: "mp_deleted_container", dollars: 30_000, pct: 30 },
    ],
    known,
    100_000
  )
  assert.equal(campaign_budget, 100_000)
  assert.ok(create_targets.some((t) => t.mp_key === UNMAPPED_MP_KEY && t.dollars === 30_000))
  assert.ok(!create_targets.some((t) => t.mp_key === "mp_deleted_container"))
  assert.equal(
    create_targets.reduce((s, t) => s + t.dollars, 0),
    100_000
  )
})
