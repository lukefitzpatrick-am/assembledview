import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  applyBalancer,
  defaultBalancingMonth,
  distributeEvenly,
  reanchorOutOfSpanToBalancer,
  reassignBalancer,
} from "../balancer.js"
import {
  applyBulkCollisionDecision,
  applyCollisionDecision,
  detectBillingCollisions,
} from "../collisionWorksheet.js"

describe("PC4 balancer arithmetic", () => {
  it("defaults balancer to last month", () => {
    assert.equal(defaultBalancingMonth(["2026-01", "2026-02", "2026-03"]), "2026-03")
  })

  it("computes balancer so months sum to line total", () => {
    const r = applyBalancer({
      lineTotal: 100,
      balancingMonth: "2026-03",
      months: [
        { month: "2026-01", amount: 40 },
        { month: "2026-02", amount: 35 },
        { month: "2026-03", amount: 999 },
      ],
    })
    assert.equal(r.balancingAmount, 25)
    assert.equal(r.reconciles, true)
    assert.equal(r.negativeBalancer, false)
    assert.match(r.footerLabel, /Months \$100\.00 \/ line \$100\.00 ✓/)
  })

  it("allows negative balancer and red-flags it", () => {
    const r = applyBalancer({
      lineTotal: 100,
      balancingMonth: "2026-03",
      months: [
        { month: "2026-01", amount: 60 },
        { month: "2026-02", amount: 50 },
        { month: "2026-03", amount: 0 },
      ],
    })
    assert.equal(r.balancingAmount, -10)
    assert.equal(r.negativeBalancer, true)
    assert.equal(r.reconciles, true)
  })

  it("reassignBalancer moves residue to the new month", () => {
    const r = reassignBalancer(
      {
        lineTotal: 90,
        balancingMonth: "2026-03",
        months: [
          { month: "2026-01", amount: 30 },
          { month: "2026-02", amount: 30 },
          { month: "2026-03", amount: 30 },
        ],
      },
      "2026-01"
    )
    assert.equal(r.balancingMonth, "2026-01")
    assert.equal(r.balancingAmount, 30)
    const jan = r.months.find((m) => m.month === "2026-01")
    assert.equal(jan?.amount, 30)
  })

  it("distributeEvenly puts cent residue on the balancer", () => {
    const r = distributeEvenly({
      lineTotal: 100,
      balancingMonth: "2026-03",
      months: [
        { month: "2026-01", amount: 0 },
        { month: "2026-02", amount: 0 },
        { month: "2026-03", amount: 0 },
      ],
    })
    const by = Object.fromEntries(r.months.map((m) => [m.month, m.amount]))
    assert.equal(by["2026-01"], 33.33)
    assert.equal(by["2026-02"], 33.33)
    assert.equal(by["2026-03"], 33.34)
    assert.equal(r.reconciles, true)
  })

  it("reanchorOutOfSpanToBalancer parks out-of-span into balancer", () => {
    const { preview, movedFrom } = reanchorOutOfSpanToBalancer({
      lineTotal: 100,
      allowedMonths: ["2026-02", "2026-03"],
      balancingMonth: "2026-03",
      months: [
        { month: "2026-01", amount: 40 },
        { month: "2026-02", amount: 30 },
        { month: "2026-03", amount: 30 },
      ],
    })
    assert.deepEqual(movedFrom, ["2026-01"])
    assert.equal(preview.balancingAmount, 70)
    assert.equal(preview.reconciles, true)
  })
})

describe("PC4 collision worksheet", () => {
  const base = {
    lineItemId: "line-a",
    label: "Search A",
    oldTotal: 10000,
    newTotal: 16000,
    balancingMonth: "2026-03",
    months: [
      { month: "2026-01", amount: 4000 },
      { month: "2026-02", amount: 3000 },
      { month: "2026-03", amount: 3000 },
    ],
  }

  it("detects only affected lines", () => {
    const rows = detectBillingCollisions([
      base,
      { ...base, lineItemId: "line-b", oldTotal: 5000, newTotal: 5000 },
    ])
    assert.equal(rows.length, 1)
    assert.equal(rows[0]!.lineItemId, "line-a")
    assert.equal(rows[0]!.delta, 6000)
  })

  it("keep_shape_delta lands delta in balancer", () => {
    const { months } = applyCollisionDecision(base, "keep_shape_delta")
    assert.ok(months)
    const by = Object.fromEntries(months!.map((m) => [m.month, m.amount]))
    assert.equal(by["2026-01"], 4000)
    assert.equal(by["2026-02"], 3000)
    assert.equal(by["2026-03"], 9000)
  })

  it("rescale proportionally with cent residue to balancer", () => {
    const { months } = applyCollisionDecision(
      {
        ...base,
        oldTotal: 100,
        newTotal: 100,
        months: [
          { month: "2026-01", amount: 10 },
          { month: "2026-02", amount: 20 },
          { month: "2026-03", amount: 70 },
        ],
      },
      "rescale"
    )
    // Same total — shape preserved via balancer enforce
    assert.ok(months)
    const sum = months!.reduce((s, m) => s + m.amount, 0)
    assert.ok(Math.abs(sum - 100) < 0.01)
  })

  it("rescale +$6k preserves proportions then balancer", () => {
    const { months } = applyCollisionDecision(base, "rescale")
    assert.ok(months)
    const sum = months!.reduce((s, m) => s + m.amount, 0)
    assert.ok(Math.abs(sum - 16000) < 0.01)
    const jan = months!.find((m) => m.month === "2026-01")!.amount
    // 4000/10000 * 16000 = 6400
    assert.ok(Math.abs(jan - 6400) < 0.02)
  })

  it("recalc_auto clears months", () => {
    const { months } = applyCollisionDecision(base, "recalc_auto")
    assert.equal(months, null)
  })

  it("bulk applies same decision to all rows", () => {
    const map = applyBulkCollisionDecision([base], "keep_shape_delta")
    assert.equal(map.size, 1)
    assert.ok(map.get("line-a")!.months)
  })
})
