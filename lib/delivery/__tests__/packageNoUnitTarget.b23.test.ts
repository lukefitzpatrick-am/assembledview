/**
 * B23 P14 (B10 finding 1): package lines have no unit target, like fixed
 * cost, once `expert_package_quantity` is on. Off: every reader is unchanged.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { estimateDirectDigitalSpend, NO_PLANNED_IMPRESSIONS } from "@/lib/delivery/estimateDirectDigitalSpend"
import { isPackageBuyType, packageHasNoUnitTarget } from "@/lib/delivery/packageUnitTarget"
import { readDeliveryFlags } from "@/lib/delivery/deliveryFlags.server"
import { DELIVERY_FLAGS_OFF, deliveryFlagsFromClient } from "@/lib/delivery/deliveryFlags"
import { setClientFeatureSnapshot } from "@/lib/features/client"
import { extractKpiReviewPlanLine } from "@/lib/kpi/kpiReview"
import { bookedDeliverablesFromRow } from "@/lib/pacing/ad-serving/resolveLiveAdServingLineItems"
import { lineCardFromAdServing } from "@/lib/pacing/channel/lineCardModel"
import { adServingFixture, LINE_AS_OF } from "@/lib/pacing/channel/__tests__/fixtures"
import { planDeliverablesFromItem } from "@/lib/reports/campaignReport/reportFigures"

const ON = { packageNoUnitTarget: true }
const OFF = { packageNoUnitTarget: false }

const packageBursts = [
  { startDate: "2026-09-01", endDate: "2026-09-30", budget: "750", buyAmount: "250", calculatedValue: 3 },
]

describe("packageHasNoUnitTarget", () => {
  it("is true only for package with the switch on, any case and spacing", () => {
    assert.equal(packageHasNoUnitTarget(" Package ", ON), true)
    assert.equal(packageHasNoUnitTarget("package", OFF), false)
    assert.equal(packageHasNoUnitTarget("package", undefined), false)
    for (const buy of ["cpm", "cpc", "cpv", "fixed_cost", "package_inclusions", "bonus", "", null]) {
      assert.equal(packageHasNoUnitTarget(buy, ON), false, String(buy))
    }
    assert.equal(isPackageBuyType("PACKAGE"), true)
  })
})

describe("bookedDeliverablesFromRow (ad-serving pacing)", () => {
  const row = { buy_type: "package", bursts: packageBursts }

  it("off: a package quantity is an impressions target, as before", () => {
    assert.deepEqual(bookedDeliverablesFromRow(row), { impressions: 3, clicks: 0 })
    assert.deepEqual(bookedDeliverablesFromRow(row, OFF), { impressions: 3, clicks: 0 })
  })

  it("on: a package line has no target; other buy types keep theirs", () => {
    assert.deepEqual(bookedDeliverablesFromRow(row, ON), { impressions: 0, clicks: 0 })
    assert.deepEqual(bookedDeliverablesFromRow({ ...row, buy_type: "cpc" }, ON), { impressions: 0, clicks: 3 })
    assert.deepEqual(bookedDeliverablesFromRow({ ...row, buy_type: "cpm" }, ON), { impressions: 3, clicks: 0 })
  })
})

describe("lineCardFromAdServing burst target", () => {
  it("a row marked noUnitTarget has no burst pacing; the same row unmarked keeps it", () => {
    const base = adServingFixture({ buyType: "package" })
    const kept = lineCardFromAdServing(base, LINE_AS_OF)
    assert.notEqual(kept.burstPct, null)
    const none = lineCardFromAdServing(
      adServingFixture({
        buyType: "package",
        noUnitTarget: true,
        deliverableKind: null,
        deliverableTarget: 0,
        plannedImpressions: 0,
      }),
      LINE_AS_OF,
    )
    assert.equal(none.burstPct, null)
  })

  it("an unmarked row is byte-identical to before (no key added)", () => {
    const row = adServingFixture()
    assert.equal("noUnitTarget" in row, false)
    assert.deepEqual(lineCardFromAdServing(row, LINE_AS_OF), lineCardFromAdServing(adServingFixture(), LINE_AS_OF))
  })
})

describe("estimateDirectDigitalSpend (CM360 estimate)", () => {
  const input = {
    lineItemId: "krusty001dd1",
    buyType: "package",
    bursts: packageBursts,
    days: [{ date: "2026-09-02", impressions: 40_000 }],
  }

  it("off: the quantity prices the first day at the full planned media, as before", () => {
    const off = estimateDirectDigitalSpend(input)
    assert.equal(off.amount, 750)
    assert.equal(off.spendMode, "estimated")
    assert.deepEqual(estimateDirectDigitalSpend({ ...input, packageNoUnitTarget: false }), off)
  })

  it("on: no estimate, no reason (like fixed cost)", () => {
    const on = estimateDirectDigitalSpend({ ...input, packageNoUnitTarget: true })
    assert.equal(on.amount, null)
    assert.equal(on.spendMode, null)
    assert.equal(on.reason, null)
    assert.notEqual(on.reason, NO_PLANNED_IMPRESSIONS)
  })

  it("on: a cpm line is still estimated", () => {
    const cpm = estimateDirectDigitalSpend({ ...input, buyType: "cpm", packageNoUnitTarget: true })
    assert.equal(cpm.spendMode, "estimated")
  })
})

describe("planDeliverablesFromItem (client dashboard and decks)", () => {
  const item = { buy_type: "package", bursts: packageBursts }

  it("off: package quantity shows as planned impressions, as before", () => {
    assert.deepEqual(planDeliverablesFromItem(item), { impressions: 3, clicks: null, views: null })
    assert.deepEqual(planDeliverablesFromItem(item, OFF), { impressions: 3, clicks: null, views: null })
  })

  it("on: none for package, even with an explicit field; cpm keeps its own", () => {
    assert.deepEqual(planDeliverablesFromItem(item, ON), { impressions: null, clicks: null, views: null })
    assert.deepEqual(planDeliverablesFromItem({ ...item, impressions: 9 }, ON), {
      impressions: null,
      clicks: null,
      views: null,
    })
    assert.deepEqual(planDeliverablesFromItem({ ...item, buyType: "cpm", buy_type: "cpm" }, ON), {
      impressions: 3,
      clicks: null,
      views: null,
    })
  })
})

describe("extractKpiReviewPlanLine (KPI plan deliverables)", () => {
  const item = { buy_type: "package", bursts: packageBursts }

  it("off: unchanged", () => {
    const off = extractKpiReviewPlanLine(item, 750)
    assert.equal(off.plannedImpressions, 3)
    assert.deepEqual(extractKpiReviewPlanLine(item, 750, OFF), off)
  })

  it("on: no planned impressions, clicks or views; the buy rate stays", () => {
    const off = extractKpiReviewPlanLine(item, 750)
    const on = extractKpiReviewPlanLine(item, 750, ON)
    assert.equal(on.plannedImpressions, null)
    assert.equal(on.plannedClicks, null)
    assert.equal(on.plannedViews, null)
    assert.equal(on.buyAmount, off.buyAmount)
  })
})

describe("delivery flags", () => {
  it("server: reads expert_package_quantity; a failed read is off", async () => {
    assert.equal((await readDeliveryFlags(async (key) => key === "expert_package_quantity")).packageNoUnitTarget, true)
    assert.equal((await readDeliveryFlags(async () => false)).packageNoUnitTarget, false)
    assert.deepEqual(
      await readDeliveryFlags(async () => {
        throw new Error("db down")
      }),
      { ...DELIVERY_FLAGS_OFF },
    )
  })

  it("browser: follows the switch snapshot, off by default", () => {
    setClientFeatureSnapshot(null)
    assert.equal(deliveryFlagsFromClient().packageNoUnitTarget, false)
    setClientFeatureSnapshot({ expert_package_quantity: true })
    assert.equal(deliveryFlagsFromClient().packageNoUnitTarget, true)
    setClientFeatureSnapshot(null)
  })
})
