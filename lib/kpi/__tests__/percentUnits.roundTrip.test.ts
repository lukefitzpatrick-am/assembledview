/**
 * AV-25 v2 — store → display → edit → store identity for ratio percent metrics.
 * CPV (dollars) must not pass through percent helpers.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  formatPercentForInput,
  parsePercentHeuristic,
} from "../metrics.js"
import { normaliseRatioTarget } from "../normaliseRatioTarget.js"
import {
  KPI_RATIO_PERCENT_METRICS,
  asStoredRatioDecimal,
  formatStoredDecimalAsPercent,
  percentPointsToStoredDecimal,
  storedDecimalToPercentPoints,
} from "../percentUnits.js"
import { formatRatioAsPercent } from "@/lib/pacing/kpi/formatKpi.js"
import { ctrCellTint } from "@/lib/pacing/kpi/kpiCellColor.js"

const ROUND_TRIP_CASES: Array<{ label: string; percentPoints: number }> = [
  { label: "0.5%", percentPoints: 0.5 },
  { label: "1%", percentPoints: 1 },
  { label: "40%", percentPoints: 40 },
  { label: "100%", percentPoints: 100 },
]

function roundTripStored(percentPoints: number): number {
  const stored = percentPointsToStoredDecimal(percentPoints)
  const display = formatStoredDecimalAsPercent(stored)
  const edited = parsePercentHeuristic(display)
  assert.ok(edited != null)
  return edited!
}

describe("percentUnits contract (AV-25 v2)", () => {
  it("sole conversion helpers are invertible for UI percentage points", () => {
    for (const { percentPoints } of ROUND_TRIP_CASES) {
      const stored = percentPointsToStoredDecimal(percentPoints)
      assert.equal(storedDecimalToPercentPoints(stored), percentPoints)
    }
  })

  it("100% stores as 1.0 and displays as 100.00% (not 1.00%)", () => {
    const stored = percentPointsToStoredDecimal(100)
    assert.equal(stored, 1)
    assert.equal(formatPercentForInput(stored), "100.00%")
    assert.equal(formatRatioAsPercent(stored), "100.00%")
    assert.equal(asStoredRatioDecimal(stored), 1)
    assert.equal(normaliseRatioTarget(stored), 1)
  })

  it("1% stores as 0.01 — distinct from 100%", () => {
    const onePct = percentPointsToStoredDecimal(1)
    assert.equal(onePct, 0.01)
    assert.equal(formatPercentForInput(onePct), "1.00%")
    assert.notEqual(onePct, percentPointsToStoredDecimal(100))
  })
})

describe("ratio metric round-trip property", () => {
  for (const metric of KPI_RATIO_PERCENT_METRICS) {
    for (const { label, percentPoints } of ROUND_TRIP_CASES) {
      it(`${metric}: ${label} store→display→edit→store is identity`, () => {
        const stored = percentPointsToStoredDecimal(percentPoints)
        const again = roundTripStored(percentPoints)
        assert.equal(again, stored)
        // Read path (status / tint) uses the same decimal.
        assert.equal(normaliseRatioTarget(stored), stored)
        assert.equal(asStoredRatioDecimal(stored), stored)
      })
    }
  }
})

describe("cpv untouched", () => {
  it("does not rescale dollar amounts through percent helpers", () => {
    // CPV $1.50 must remain 1.5 if someone mistakenly called the old heuristic.
    const dollars = 1.5
    assert.equal(asStoredRatioDecimal(dollars), dollars)
    // formatPercent would be wrong for cpv — callers must not use it for dollars.
    // Contract: parse/format percent APIs are for ratio metrics only.
    assert.equal(parsePercentHeuristic("1.5"), 0.015)
    assert.notEqual(parsePercentHeuristic("1.5"), dollars)
  })
})

describe("kpiCellColor threshold uses decimal helper", () => {
  it("100% target (stored 1) thresholds against actual 0.95 as on-track band", () => {
    // KPI_TOLERANCE is typically 0.1 → threshold 0.9 for target 1.0
    const tint = ctrCellTint(0.95, 1)
    assert.equal(tint, "bg-pacing-on-track-bg")
  })

  it("does not treat stored 1 as 1% (old heuristic would use threshold 0.009)", () => {
    // Under old heuristic, target 1 → 0.01, threshold ~0.009; actual 0.5 would be on-track.
    // Under decimal, target 1 = 100%, threshold ~0.9; actual 0.5 is off-target.
    const tint = ctrCellTint(0.5, 1)
    assert.equal(tint, "bg-pacing-critical-bg")
  })
})
