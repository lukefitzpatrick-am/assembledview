import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { fromCents, roundMoney2, sumCents, toCents, toCentsOrNull } from "@/lib/money"

describe("toCents", () => {
  it("rounds half-up away from zero", () => {
    assert.equal(toCents(1.005), 101)
    assert.equal(toCents(-1.005), -101)
    assert.equal(toCents(125.025), 12503)
    assert.equal(toCents(0.1 + 0.2), 30)
    assert.equal(toCents(1e-9), 0)
    assert.equal(toCents(2.675), 268)
    assert.equal(toCents(1234567.895), 123456790)
    assert.equal(Object.is(toCents(-0), 0), true)
    assert.equal(Object.is(toCents(0), 0), true)
  })

  it("covers negatives and large values", () => {
    assert.equal(toCents(-2.675), -268)
    assert.equal(toCents(-0.005), -1)
    assert.equal(toCents(0.004), 0)
    assert.equal(toCents(9999999.995), 1000000000)
    assert.equal(toCents(-1234567.895), -123456790)
  })

  it("throws on a non-finite value", () => {
    assert.throws(() => toCents(Number.NaN), TypeError)
    assert.throws(() => toCents(Number.POSITIVE_INFINITY), TypeError)
  })
})

describe("toCentsOrNull", () => {
  it("returns null for anything that is not a finite number", () => {
    assert.equal(toCentsOrNull(null), null)
    assert.equal(toCentsOrNull("1.00"), null)
    assert.equal(toCentsOrNull(Number.NaN), null)
    assert.equal(toCentsOrNull(1.005), 101)
  })
})

describe("fromCents and roundMoney2", () => {
  it("round-trips through cents", () => {
    assert.equal(fromCents(101), 1.01)
    assert.equal(roundMoney2(1.005), 1.01)
    assert.equal(roundMoney2(-1.005), -1.01)
  })
})

describe("sumCents", () => {
  it("sums integers and rejects floats", () => {
    assert.equal(sumCents([101, -1, 0]), 100)
    assert.throws(() => sumCents([1.5]), TypeError)
  })
})
