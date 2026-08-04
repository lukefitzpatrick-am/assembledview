import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  evaluateAdServingZeroTripwire,
  type AdServingTripwirePerLine,
} from "@/lib/billing/adServingSaveTripwire"

function line(
  id: string,
  mediaType: string,
  deliverables: number,
  excluded = false
): AdServingTripwirePerLine {
  return {
    lineItemId: id,
    mediaType,
    deliverables,
    flags: { excluded },
  }
}

describe("evaluateAdServingZeroTripwire", () => {
  it("campaign_zero when total is $0 and eligible lines exist", () => {
    const result = evaluateAdServingZeroTripwire({
      adServingTotal: 0,
      perLine: [line("billing-progDisplay::A", "progDisplay", 100_000)],
      noAdservingByLineId: new Map(),
      lineAdServingById: new Map([["billing-progDisplay::A", 0]]),
    })
    assert.ok(result)
    assert.equal(result!.kind, "campaign_zero")
    assert.equal(result!.zeroLines.length, 1)
  })

  it("partial_zero when some eligible lines charge and others are $0", () => {
    const result = evaluateAdServingZeroTripwire({
      adServingTotal: 250,
      perLine: [
        line("billing-progDisplay::A", "progDisplay", 100_000),
        line("billing-digiDisplay::B", "digiDisplay", 50_000),
      ],
      noAdservingByLineId: new Map(),
      lineAdServingById: new Map([
        ["billing-progDisplay::A", 250],
        ["billing-digiDisplay::B", 0],
      ]),
    })
    assert.ok(result)
    assert.equal(result!.kind, "partial_zero")
    assert.equal(result!.chargedLines.length, 1)
    assert.equal(result!.zeroLines.length, 1)
    assert.equal(result!.zeroLines[0]!.lineItemId, "billing-digiDisplay::B")
  })

  it("skips noAdserving / excluded / ineligible / zero deliverables", () => {
    const result = evaluateAdServingZeroTripwire({
      adServingTotal: 0,
      perLine: [
        line("billing-progDisplay::A", "progDisplay", 100_000),
        line("billing-search::S", "search", 100_000),
        line("billing-progDisplay::X", "progDisplay", 100_000, true),
        line("billing-progDisplay::Z", "progDisplay", 0),
      ],
      noAdservingByLineId: new Map([["billing-progDisplay::A", true]]),
      lineAdServingById: new Map(),
    })
    assert.equal(result, null)
  })

  it("silent when all chargeable eligible lines have ad serving", () => {
    const result = evaluateAdServingZeroTripwire({
      adServingTotal: 500,
      perLine: [
        line("billing-progDisplay::A", "progDisplay", 100_000),
        line("billing-digiDisplay::B", "digiDisplay", 50_000),
      ],
      noAdservingByLineId: new Map(),
      lineAdServingById: new Map([
        ["billing-progDisplay::A", 250],
        ["billing-digiDisplay::B", 250],
      ]),
    })
    assert.equal(result, null)
  })
})
