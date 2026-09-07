import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  draftFieldLabel,
  fallbackDraftFieldLabel,
} from "../fieldLabels.js"

/** Unique fieldPath values from the glenda008 working draft (ooh + socialMedia + siblings). */
const GLENDA008_DIALOG_PATHS = [
  "bid_strategy",
  "budget_includes_fees",
  "bursts.0.amount",
  "bursts.0.budget",
  "bursts.0.buyAmount",
  "bursts.0.cost",
  "bursts.0.description",
  "bursts.0.endDate",
  "bursts.0.market",
  "bursts.0.startDate",
  "bursts.1.budget",
  "bursts.1.buyAmount",
  "bursts.1.endDate",
  "bursts.1.startDate",
  "bursts.2.budget",
  "bursts.2.buyAmount",
  "bursts.2.endDate",
  "bursts.2.startDate",
  "buy_type",
  "buying_demo",
  "client_pays_for_media",
  "creative",
  "creative_targeting",
  "description",
  "duration",
  "feePct",
  "fixed_cost_media",
  "format",
  "line_item",
  "line_item_id",
  "market",
  "mba_number",
  "media_plan_version",
  "media_type",
  "mp_client_name",
  "mp_plannumber",
  "network",
  "no_adserving",
  "placement",
  "platform",
  "publisher",
  "site",
  "size",
  "station",
  "targeting",
  "type",
  "unitRate",
  "mp_campaignbudget",
  "mp_campaigndates_start",
  "mp_campaigndates_end",
  "mp_campaignstatus",
  "mp_clientname",
  "mbanumber",
  "mp_fixedfee",
] as const

describe("draftFieldLabel", () => {
  it("maps every glenda008 dialog path to a human label, never the raw path", () => {
    for (const path of GLENDA008_DIALOG_PATHS) {
      const label = draftFieldLabel(path)
      assert.notEqual(label, path, path)
      assert.ok(!label.includes("bursts."), path)
      assert.match(label, /[A-Za-z]/, path)
    }
    assert.equal(draftFieldLabel("bursts.0.budget"), "Burst 1 Budget")
    assert.equal(draftFieldLabel("mp_campaignbudget"), "Campaign budget")
  })

  it("falls back by de-snake-casing and turning indices into Burst N", () => {
    assert.equal(
      fallbackDraftFieldLabel("unmapped_snake.2.otherKey"),
      "Unmapped snake · Burst 3 · Other key",
    )
    assert.equal(
      draftFieldLabel("unmapped_snake.2.otherKey"),
      "Unmapped snake · Burst 3 · Other key",
    )
  })
})
