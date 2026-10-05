import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  evaluateAdServingZeroTripwire,
  withAdServingTripwireCompute,
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

  it("skips fixed_cost lines with no adServingImpressions", () => {
    const result = evaluateAdServingZeroTripwire({
      adServingTotal: 0,
      perLine: [
        {
          ...line("billing-progOoh::F", "progOoh", 1),
          buyType: "fixed cost",
          adServingImpressions: 0,
        },
      ],
      noAdservingByLineId: new Map(),
      lineAdServingById: new Map([["billing-progOoh::F", 0]]),
    })
    assert.equal(result, null)
  })

  it("still flags fixed_cost when impressions are set and the schedule is $0", () => {
    const result = evaluateAdServingZeroTripwire({
      adServingTotal: 0,
      perLine: [
        {
          ...line("billing-progOoh::F", "progOoh", 1),
          buyType: "fixed_cost",
          adServingImpressions: 10_000,
        },
      ],
      noAdservingByLineId: new Map(),
      lineAdServingById: new Map([["billing-progOoh::F", 0]]),
    })
    assert.ok(result)
    assert.equal(result!.kind, "campaign_zero")
  })

  it("skips a positive compute that rounds below one cent", () => {
    const result = evaluateAdServingZeroTripwire({
      adServingTotal: 0,
      perLine: [
        {
          ...line("billing-progDisplay::A", "progDisplay", 100_000),
          computedAdServing: 0.004,
        },
      ],
      noAdservingByLineId: new Map(),
      lineAdServingById: new Map([["billing-progDisplay::A", 0]]),
    })
    assert.equal(result, null)
  })

  it("still flags an exact zero compute (missing rate is not sub-cent by design)", () => {
    const result = evaluateAdServingZeroTripwire({
      adServingTotal: 0,
      perLine: [
        {
          ...line("billing-progDisplay::A", "progDisplay", 100_000),
          computedAdServing: 0,
        },
      ],
      noAdservingByLineId: new Map(),
      lineAdServingById: new Map([["billing-progDisplay::A", 0]]),
    })
    assert.ok(result)
    assert.equal(result!.kind, "campaign_zero")
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

describe("withAdServingTripwireCompute", () => {
  it("stamps fixed_cost impressions and a sub-cent cpm compute", () => {
    const stamped = withAdServingTripwireCompute(
      [
        line("billing-progOoh::F", "progOoh", 1),
        line("billing-progDisplay::A", "progDisplay", 1_000),
      ],
      [
        {
          lineItemId: "billing-progOoh::F",
          mediaType: "progOoh",
          buyType: "fixed_cost",
          bursts: [{ deliverables: 1 }],
        },
        {
          lineItemId: "billing-progDisplay::A",
          mediaType: "progDisplay",
          buyType: "cpm",
          bursts: [{ deliverables: 1_000 }],
        },
      ],
      (mediaType) => (mediaType === "progDisplay" ? 0.004 : 1),
    )
    assert.equal(stamped[0]!.adServingImpressions, 0)
    assert.equal(stamped[0]!.computedAdServing, 0)
    assert.equal(stamped[1]!.computedAdServing, 0.004)
  })
})
