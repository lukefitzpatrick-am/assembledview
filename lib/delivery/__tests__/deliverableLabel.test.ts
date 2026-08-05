import assert from "node:assert/strict"
import test from "node:test"

import {
  aggregateDeliverableLabel,
  deliverableLabelForBuyType,
  deliverableLabelForMetricKey,
} from "../deliverableLabel.js"

test("deliverableLabelForBuyType — twelve known buy types", () => {
  assert.equal(deliverableLabelForBuyType("cpm"), "Impressions")
  assert.equal(deliverableLabelForBuyType("bonus"), "Impressions")
  assert.equal(deliverableLabelForBuyType("package_inclusions"), "Impressions")
  assert.equal(deliverableLabelForBuyType("cpc"), "Clicks")
  assert.equal(deliverableLabelForBuyType("cpv"), "Views")
  assert.equal(deliverableLabelForBuyType("spots"), "Spots")
  assert.equal(deliverableLabelForBuyType("insertions"), "Insertions")
  assert.equal(deliverableLabelForBuyType("panels"), "Panels")
  assert.equal(deliverableLabelForBuyType("package"), "Deliverables")
  assert.equal(deliverableLabelForBuyType("fixed_cost"), "Deliverables")
  assert.equal(deliverableLabelForBuyType("cpp"), "TARPs")
})

test("deliverableLabelForBuyType — case/trim insensitive; null/unknown → Deliverable", () => {
  assert.equal(deliverableLabelForBuyType("  CPC  "), "Clicks")
  assert.equal(deliverableLabelForBuyType("CPM"), "Impressions")
  assert.equal(deliverableLabelForBuyType(null), "Deliverable")
  assert.equal(deliverableLabelForBuyType(""), "Deliverable")
  assert.equal(deliverableLabelForBuyType("   "), "Deliverable")
  assert.equal(deliverableLabelForBuyType("mystery_buy"), "Deliverable")
  assert.equal(deliverableLabelForBuyType("cpc_extra"), "Deliverable")
})

test("aggregateDeliverableLabel", () => {
  assert.equal(aggregateDeliverableLabel(["cpc"]), "Clicks")
  assert.equal(aggregateDeliverableLabel(["cpc", "cpc"]), "Clicks")
  assert.equal(aggregateDeliverableLabel(["cpc", "cpm"]), "Deliverable")
  assert.equal(aggregateDeliverableLabel([]), "Deliverable")
  assert.equal(aggregateDeliverableLabel([null, "cpm"]), "Impressions")
  assert.equal(aggregateDeliverableLabel([null, "", "  "]), "Deliverable")
  assert.equal(aggregateDeliverableLabel(["CPC", "cpc"]), "Clicks")
})

test("deliverableLabelForMetricKey keeps key→label map for social/prog helpers", () => {
  assert.equal(deliverableLabelForMetricKey("clicks"), "Clicks")
  assert.equal(deliverableLabelForMetricKey("results"), "Conversions")
  assert.equal(deliverableLabelForMetricKey("conversions"), "Conversions")
  assert.equal(deliverableLabelForMetricKey("video_3s_views"), "Video Views")
  assert.equal(deliverableLabelForMetricKey("videoViews"), "Video Views")
  assert.equal(deliverableLabelForMetricKey("impressions"), "Impressions")
  assert.equal(deliverableLabelForMetricKey(null), "Impressions")
})
