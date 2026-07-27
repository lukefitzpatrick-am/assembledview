import assert from "node:assert/strict"
import test from "node:test"

import {
  detectBilledDrift,
  hashBilledLineSet,
  type BilledLineSnapshot,
} from "../billedDrift.js"

function lines(
  rows: Array<Partial<BilledLineSnapshot> & Pick<BilledLineSnapshot, "item_code" | "amount">>
): BilledLineSnapshot[] {
  return rows.map((r) => ({
    item_code: r.item_code,
    amount: r.amount,
    schedule_line_item_id: r.schedule_line_item_id ?? null,
  }))
}

test("hashBilledLineSet: order-independent for same line set", () => {
  const a = hashBilledLineSet(
    lines([
      { item_code: "TV-1", amount: 100, schedule_line_item_id: "a" },
      { item_code: "FEE", amount: 10 },
    ])
  )
  const b = hashBilledLineSet(
    lines([
      { item_code: "FEE", amount: 10 },
      { item_code: "TV-1", amount: 100, schedule_line_item_id: "a" },
    ])
  )
  assert.equal(a, b)
})

test("hashBilledLineSet: amount or identity change yields different hash", () => {
  const base = hashBilledLineSet(lines([{ item_code: "TV-1", amount: 100, schedule_line_item_id: "a" }]))
  const amt = hashBilledLineSet(lines([{ item_code: "TV-1", amount: 150, schedule_line_item_id: "a" }]))
  const id = hashBilledLineSet(lines([{ item_code: "TV-1", amount: 100, schedule_line_item_id: "b" }]))
  assert.notEqual(base, amt)
  assert.notEqual(base, id)
})

test("detectBilledDrift: no drift when not billed", () => {
  const result = detectBilledDrift({
    billed: false,
    billedAmount: 110,
    billedLinesHash: "abc",
    currentTotal: 999,
    currentLines: lines([{ item_code: "TV-1", amount: 999 }]),
  })
  assert.equal(result.drift, false)
  assert.equal(result.delta, null)
})

test("detectBilledDrift: no drift when billed amount and lines match", () => {
  const currentLines = lines([
    { item_code: "TV-1", amount: 100, schedule_line_item_id: "a" },
    { item_code: "FEE", amount: 10 },
  ])
  const billedLinesHash = hashBilledLineSet(currentLines)
  const result = detectBilledDrift({
    billed: true,
    billedAmount: 110,
    billedLinesHash,
    currentTotal: 110,
    currentLines,
  })
  assert.equal(result.drift, false)
  assert.equal(result.delta, 0)
  assert.equal(result.amountMismatch, false)
  assert.equal(result.linesMismatch, false)
})

test("detectBilledDrift: flags DRIFT when recomputed amount differs from billed amount", () => {
  const billedLines = lines([{ item_code: "TV-1", amount: 100, schedule_line_item_id: "a" }])
  const billedLinesHash = hashBilledLineSet(billedLines)
  // Line edited after bill time — amount changed, hash also changes
  const currentLines = lines([{ item_code: "TV-1", amount: 150, schedule_line_item_id: "a" }])
  const result = detectBilledDrift({
    billed: true,
    billedAmount: 100,
    billedLinesHash,
    currentTotal: 150,
    currentLines,
  })
  assert.equal(result.drift, true)
  assert.equal(result.amountMismatch, true)
  assert.equal(result.linesMismatch, true)
  assert.equal(result.delta, 50)
})

test("detectBilledDrift: flags DRIFT on line-set change even if total matches", () => {
  const billedLines = lines([
    { item_code: "TV-1", amount: 60, schedule_line_item_id: "a" },
    { item_code: "TV-2", amount: 40, schedule_line_item_id: "b" },
  ])
  const billedLinesHash = hashBilledLineSet(billedLines)
  const currentLines = lines([
    { item_code: "TV-1", amount: 50, schedule_line_item_id: "a" },
    { item_code: "TV-2", amount: 50, schedule_line_item_id: "b" },
  ])
  const result = detectBilledDrift({
    billed: true,
    billedAmount: 100,
    billedLinesHash,
    currentTotal: 100,
    currentLines,
  })
  assert.equal(result.drift, true)
  assert.equal(result.amountMismatch, false)
  assert.equal(result.linesMismatch, true)
  assert.equal(result.delta, 0)
})

test("detectBilledDrift: sub-cent amount noise is not drift", () => {
  const currentLines = lines([{ item_code: "TV-1", amount: 100.004 }])
  const result = detectBilledDrift({
    billed: true,
    billedAmount: 100,
    billedLinesHash: hashBilledLineSet(currentLines),
    currentTotal: 100.004,
    currentLines,
  })
  assert.equal(result.drift, false)
  assert.equal(result.amountMismatch, false)
})

test("detectBilledDrift: legacy billed row without stored amount does not invent drift", () => {
  const result = detectBilledDrift({
    billed: true,
    billedAmount: null,
    billedLinesHash: null,
    currentTotal: 500,
    currentLines: lines([{ item_code: "TV-1", amount: 500 }]),
  })
  assert.equal(result.drift, false)
  assert.equal(result.delta, null)
})
