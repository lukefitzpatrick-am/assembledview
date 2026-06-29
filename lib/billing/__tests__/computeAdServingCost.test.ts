import assert from "node:assert/strict"
import test from "node:test"

import { computeAdServingCost } from "../computeAdServingCost.js"

test("uses resolved KPI ctr/vtr before baseline when no manual ad-serving percentage exists", () => {
  const cpcCost = computeAdServingCost({
    quantity: 100,
    buyType: "cpc",
    mediaType: "digiDisplay",
    rate: 1,
    kpiCtr: 0.02,
  })
  const cpvCost = computeAdServingCost({
    quantity: 250,
    buyType: "cpv",
    mediaType: "digiVideo",
    rate: 2,
    kpiVtr: 0.5,
  })

  assert.equal(cpcCost, 5)
  assert.equal(cpvCost, 1)
})

test("manual ad-serving percentage overrides resolved KPI ctr/vtr", () => {
  const cpcCost = computeAdServingCost({
    quantity: 100,
    buyType: "cpc",
    mediaType: "digiDisplay",
    rate: 1,
    adServingRatePct: 1,
    kpiCtr: 0.02,
  })
  const cpvCost = computeAdServingCost({
    quantity: 250,
    buyType: "cpv",
    mediaType: "digiVideo",
    rate: 2,
    adServingRatePct: 10,
    kpiVtr: 0.5,
  })

  assert.equal(cpcCost, 10)
  assert.equal(cpvCost, 5)
})
