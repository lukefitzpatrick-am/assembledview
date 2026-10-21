import assert from "node:assert/strict"
import test from "node:test"

import { cpa, cpc, cpm, cpv, ctr, cvr, safeRatio, vtr } from "@/lib/money/rates"

test("cpm is spend per thousand impressions", () => {
  assert.equal(cpm(10, 1000), 10)
  assert.equal(cpm(10, 0), null)
})

test("ctr and vtr are decimals", () => {
  assert.equal(ctr(123, 10000), 0.0123)
  assert.equal(ctr(0, 1000), 0)
  assert.equal(ctr(5, 0), null)
  assert.equal(vtr(250, 10000), 0.025)
  assert.equal(vtr(1, 0), null)
})

test("cpc cpv cpa are null when the count is zero", () => {
  assert.equal(cpc(20, 4), 5)
  assert.equal(cpc(20, 0), null)
  assert.equal(cpv(9, 3), 3)
  assert.equal(cpv(9, 0), null)
  assert.equal(cpa(40, 2), 20)
  assert.equal(cpa(40, 0), null)
})

test("safeRatio rejects a bad denominator", () => {
  assert.equal(safeRatio(1, 0), null)
  assert.equal(safeRatio(1, Number.NaN), null)
  assert.equal(safeRatio(Number.POSITIVE_INFINITY, 2), null)
})

test("cvr is results over clicks as a decimal, never over impressions", () => {
  // hartm001sm3, 1-20 Oct 2026: 254,343 impressions, 1,449 clicks, 124 results.
  assert.equal(cvr(124, 1449), 124 / 1449)
  assert.equal(cvr(0, 1449), 0)
  assert.equal(cvr(5, 0), null)
})
