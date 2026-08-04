/**
 * AS-2: ad-serving exclusion is LINE-level. Editor preview and server compute
 * must both honor line.noAdserving for the same fixture.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { computeMediaLineAdServingMonthlyAmounts } from "@/lib/billing/computeMediaLineAdServingMonthly"
import { resolveLineNoAdserving } from "@/lib/billing/resolveLineNoAdserving"
import { computeCampaignFinancials } from "@/lib/finance/computeCampaignFinancials"
import type { LineItemInput } from "@/lib/finance/campaignFinancials.types"

const RATE = 2.5
const getRate = (mediaType: string) =>
  mediaType === "progDisplay" || mediaType === "prog display" ? RATE : 0

function progDisplayLine(noAdserving: boolean): {
  mediaLineItem: Record<string, unknown>
  engineInput: LineItemInput
} {
  const bursts = [
    {
      startDate: "2026-05-01",
      endDate: "2026-05-31",
      budget: 5_000,
      buyAmount: 10,
      buyType: "cpm",
      deliverables: 500_000,
      // persisted bursts leave noAdserving null — must not be an input
      noAdserving: null,
    },
  ]
  const mediaLineItem = {
    line_item_id: "BOSS011PD1",
    platform: "DV360",
    buy_type: "cpm",
    noadserving: noAdserving,
    no_adserving: noAdserving,
    bursts,
  }
  const engineInput: LineItemInput = {
    lineItemId: "billing-progDisplay::BOSS011PD1",
    mediaType: "progDisplay",
    buyType: "cpm",
    rate: 10,
    enteredAmount: 5_000,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    feePct: 15,
    noAdserving,
    label: "DV360",
    bursts: bursts.map((b) => ({
      startDate: b.startDate,
      endDate: b.endDate,
      budget: b.budget,
      buyAmount: b.buyAmount,
      deliverables: b.deliverables,
    })),
    approval: "approved",
  }
  return { mediaLineItem, engineInput }
}

describe("noAdserving line-level parity (editor preview vs server)", () => {
  it("resolveLineNoAdserving reads line keys only", () => {
    assert.equal(resolveLineNoAdserving({ noadserving: true }), true)
    assert.equal(resolveLineNoAdserving({ no_adserving: true }), true)
    assert.equal(resolveLineNoAdserving({ noAdserving: true }), true)
    assert.equal(
      resolveLineNoAdserving({ bursts: [{ noAdserving: true }] }),
      false,
      "burst-only must not count",
    )
  })

  it("noAdserving=true → ad serving 0 on editor preview AND server", () => {
    const { mediaLineItem, engineInput } = progDisplayLine(true)

    const preview = computeMediaLineAdServingMonthlyAmounts({
      lineItem: mediaLineItem,
      bursts: mediaLineItem.bursts as unknown[],
      monthKeys: ["May 2026"],
      mediaType: "progDisplay",
      getRateForMediaType: getRate,
    })
    assert.equal(preview.totalAdServingAmount, 0)

    const server = computeCampaignFinancials(
      [engineInput],
      { feeLoading: {} },
      { getRateForMediaType: getRate },
    )
    assert.equal(server.mbaScopeTotals.adServing, 0)
    assert.equal(preview.totalAdServingAmount, server.mbaScopeTotals.adServing)
  })

  it("noAdserving=false → identical non-zero amounts on both paths", () => {
    const { mediaLineItem, engineInput } = progDisplayLine(false)

    const preview = computeMediaLineAdServingMonthlyAmounts({
      lineItem: mediaLineItem,
      bursts: mediaLineItem.bursts as unknown[],
      monthKeys: ["May 2026"],
      mediaType: "progDisplay",
      getRateForMediaType: getRate,
    })
    assert.ok(preview.totalAdServingAmount > 0, "preview must charge ad serving")

    const server = computeCampaignFinancials(
      [engineInput],
      { feeLoading: {} },
      { getRateForMediaType: getRate },
    )
    assert.ok(server.mbaScopeTotals.adServing > 0, "server must charge ad serving")

    // Same fixture + same rate → same dollars (round to cents)
    assert.equal(
      Math.round(preview.totalAdServingAmount * 100),
      Math.round(server.mbaScopeTotals.adServing * 100),
    )
  })

  it("reading burst.noAdserving alone would wrongly charge when line excludes (regression)", () => {
    const { mediaLineItem } = progDisplayLine(true)
    // Simulate the pre-fix defect: ignore line, trust burst (null → falsy → charge)
    const burstNoAd = Boolean(
      (mediaLineItem.bursts as { noAdserving: null }[])[0]!.noAdserving
    )
    assert.equal(burstNoAd, false, "burst stamp absent → defect would charge")
    assert.equal(
      resolveLineNoAdserving(mediaLineItem),
      true,
      "line flag correctly excludes",
    )
  })
})
