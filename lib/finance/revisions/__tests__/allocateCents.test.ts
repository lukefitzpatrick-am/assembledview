import assert from "node:assert/strict"
import test from "node:test"

import { allocateCents } from "../allocateCents"

const asObj = (m: Map<string, number>) => Object.fromEntries(m)

test("remainder lands on the largest weight", () => {
  const out = allocateCents(1_000_000, [
    ["DD1", 505_435],
    ["DD7", 503_169],
  ])
  assert.deepEqual(asObj(out), { DD1: 501_124, DD7: 498_876 })
})

test("ties go to the first key in order", () => {
  assert.deepEqual(asObj(allocateCents(10, [["a", 3], ["b", 3], ["c", 3]])), { a: 4, b: 3, c: 3 })
})

test("W = 0 splits equally", () => {
  assert.deepEqual(asObj(allocateCents(10, [["a", 0], ["b", 0], ["c", 0]])), { a: 4, b: 3, c: 3 })
})

test("never gives a key more than its weight when total <= W", () => {
  const out = allocateCents(2, [["a", 1], ["b", 1], ["c", 1]])
  for (const v of out.values()) assert.ok(v <= 1)
  assert.equal([...out.values()].reduce((s, v) => s + v, 0), 2)
})

test("BigInt range: large totals keep every cent", () => {
  const big = 9_000_000_000_000
  const out = allocateCents(big, [["a", 7_000_000_000_000], ["b", 3_000_000_000_001]])
  assert.equal(out.get("a")! + out.get("b")!, big)
  assert.ok(out.get("b")! <= 3_000_000_000_001)
})

test("zero total gives zeros", () => {
  assert.deepEqual(asObj(allocateCents(0, [["a", 5], ["b", 7]])), { a: 0, b: 0 })
})

test("rejects bad input", () => {
  assert.throws(() => allocateCents(1.5, [["a", 1]]))
  assert.throws(() => allocateCents(1, [["a", -1]]))
  assert.throws(() => allocateCents(1, []))
})
