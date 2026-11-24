/**
 * M1 `one_net_media`: server paths pass the switch, the browser reads its
 * snapshot, and the save row totalMedia follows computeBurstAmounts.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { readDeliveryFlags } from "@/lib/delivery/deliveryFlags.server"
import { estimateDirectDigitalSpend } from "@/lib/delivery/estimateDirectDigitalSpend"
import { setClientFeatureSnapshot } from "@/lib/features/client"
import { featureDefinition } from "@/lib/features/registry"
import { formatMoney } from "@/lib/format/money"
import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"
import { computeDeliverableFromMedia, netFromGross } from "@/lib/mediaplan/deliverableBudget"
import { lineSaveTotalMedia } from "@/lib/money/burst"
import { lineExpectedNetToDate } from "@/lib/pacing/detail/netBurstMediaForPacing"

const net = (g: number, p: number) =>
  computeBurstAmounts({ rawBudget: g, budgetIncludesFees: true, clientPaysForMedia: false, feePct: p }).deliveryMediaAmount

test("the switch is a default-off finance switch with no requirement", () => {
  const def = featureDefinition("one_net_media")
  assert.ok(def)
  assert.equal(def.defaultOn, false)
  assert.equal(def.area, "finance")
  assert.equal("requires" in def ? def.requires : undefined, undefined)
})

test("netFromGross: the cent-edge pair follows computeBurstAmounts only when on", (t) => {
  t.after(() => setClientFeatureSnapshot(null))
  // 10.50 at 7%: 9.764999999999999 by the old order, 9.765 by computeBurstAmounts.
  assert.equal(netFromGross(10.5, true, 7, false), 9.764999999999999)
  assert.equal(netFromGross(10.5, true, 7, true), net(10.5, 7))
  assert.equal(netFromGross(10.5, true, 7, true), 9.765)
  assert.equal(netFromGross(10.5, false, 7, true), 10.5)
  // Unset reads the browser snapshot.
  assert.equal(netFromGross(10.5, true, 7), 9.764999999999999)
  setClientFeatureSnapshot({ one_net_media: true })
  assert.equal(netFromGross(10.5, true, 7), 9.765)
  // An explicit server value beats the snapshot.
  assert.equal(netFromGross(10.5, true, 7, false), 9.764999999999999)
})

test("netFromGross on keeps the NaN sentinel for a non-finite budget or fee", () => {
  assert.ok(Number.isNaN(netFromGross(Number.NaN, true, 10, true)))
  assert.ok(Number.isNaN(netFromGross(100, true, Number.NaN, true)))
  assert.ok(
    Number.isNaN(
      computeDeliverableFromMedia({ buyType: "cpm", rawBudget: Number.NaN, buyAmount: 10, budgetIncludesFees: true, feePct: 10 }),
    ),
  )
})

test("server paths take the switch as passed, never the browser snapshot", () => {
  const base = {
    bursts: [{ startDate: "2026-03-01", endDate: "2026-03-31", budget: 10.5 }],
    budgetIncludesFees: true,
    feePct: 7,
    lineBudget: 0,
    lineStart: "2026-03-01",
    lineEnd: "2026-03-31",
    asOf: "2026-03-31",
    lineItemId: "m1",
  }
  assert.equal(lineExpectedNetToDate({ ...base, oneNetMedia: true }), 9.765)
  assert.equal(lineExpectedNetToDate({ ...base, oneNetMedia: false }), 9.764999999999999)
  assert.equal(lineExpectedNetToDate({ ...base, bursts: [], lineBudget: 10.5, asOf: "2026-03-31", oneNetMedia: true }), 9.765)
  // Screens format the raw float (C-420), so the cent-edge pair shows a different cent.
  assert.equal(formatMoney(lineExpectedNetToDate({ ...base, oneNetMedia: true })), "$9.77")
  assert.equal(formatMoney(lineExpectedNetToDate({ ...base, oneNetMedia: false })), "$9.76")

  // The estimate rounds to cents with toCents, which absorbs a float bit. The one pair found
  // in 30 million random tries where the cent itself moves: $6,422,837.50 at 42.84%.
  const estimate = (oneNetMedia: boolean) =>
    estimateDirectDigitalSpend({
      lineItemId: "m1dd",
      buyType: "cpm",
      budgetIncludesFees: true,
      feePct: 42.84,
      versionId: 1,
      bursts: [{ budget: "$6,422,837.50", calculatedValue: 1000 }],
      days: [{ date: "2026-03-01", impressions: 2000 }],
      oneNetMedia,
    }).amount
  assert.equal(estimate(true), 3671293.92)
  assert.equal(estimate(false), 3671293.91)
})

test("readDeliveryFlags reads one_net_media, and a failed read is off", async () => {
  assert.equal((await readDeliveryFlags(async (key) => key === "one_net_media")).oneNetMedia, true)
  assert.equal((await readDeliveryFlags(async () => false)).oneNetMedia, false)
  const failed = await readDeliveryFlags(async () => {
    throw new Error("down")
  })
  assert.equal(failed.oneNetMedia, false)
})

test("lineSaveTotalMedia: on sums deliveryMediaAmount, so value-add saves 0 and client-pays keeps delivery media", () => {
  const line = { budgetIncludesFees: true, bursts: [{ budget: "$0.35" }, { budget: 1000 }] }
  assert.equal(lineSaveTotalMedia(line, 10, false), (0.35 * 90) / 100 + (1000 * 90) / 100)
  assert.equal(lineSaveTotalMedia(line, 10, true), net(0.35, 10) + net(1000, 10))
  for (const buyType of ["bonus", "package_inclusions", " Bonus "]) {
    const valueAdd = { buyType, bursts: [{ budget: 3000 }] }
    assert.equal(lineSaveTotalMedia(valueAdd, 15, false), 3000)
    assert.equal(lineSaveTotalMedia(valueAdd, 15, true), 0)
  }
  const clientPays = { clientPaysForMedia: true, bursts: [{ budget: 1000 }] }
  assert.equal(lineSaveTotalMedia(clientPays, 20, true), 1000)
  assert.equal(lineSaveTotalMedia({ bursts: [{ budget: "" }, { budget: null }] }, 20, true), 0)
  assert.equal(lineSaveTotalMedia({ budgetIncludesFees: true, bursts: [{ budget: 500 }] }, 0, true), 500)
})
