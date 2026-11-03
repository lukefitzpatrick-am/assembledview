/**
 * B23fix (B23 review finding 1): `expert_package_quantity` requires
 * `fixed_cost_report_net`. The Snowflake fixed-cost report treats package as
 * time based only on the net basis, so the switch counts only with both on:
 * the readers (server and browser) and the grids agree with Snowflake.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { combinePackageQuantity, deliveryFlagsFromClient } from "@/lib/delivery/deliveryFlags"
import { readDeliveryFlags } from "@/lib/delivery/deliveryFlags.server"
import { setClientFeatureSnapshot } from "@/lib/features/client"
import { buildFeaturePageModel } from "@/lib/features/pageModel"
import { featureDefinition } from "@/lib/features/registry"
import * as maps from "@/lib/mediaplan/expertChannelMappings"
import * as rowsCfg from "@/lib/mediaplan/expertGridChannelConfig"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"

describe("registry", () => {
  const def = featureDefinition("expert_package_quantity")!

  it("declares requires fixed_cost_report_net and stays default off", () => {
    assert.deepEqual("requires" in def ? def.requires : undefined, ["fixed_cost_report_net"])
    assert.equal(def.defaultOn, false)
  })

  it("the text names the ATL lines it clears, the net switch and the reverse window", () => {
    assert.match(def.description, /OOH, radio, TV and newspaper package lines/)
    assert.match(def.description, /47 live/)
    assert.match(def.description, /fixed-cost report on net media switch/)
    assert.match(def.description, /off after it was on puts saved package quantities back as targets/)
  })

  it("/admin/features hints the missing net switch", () => {
    const states = [
      { key: "expert_package_quantity", enabled: false },
      { key: "fixed_cost_report_net", enabled: false },
    ]
    const rows = buildFeaturePageModel({ ready: true, states: states as never, roles: { admin: true, financeAdmin: true } })
      .flatMap((g) => g.rows)
    const row = rows.find((r) => r.key === "expert_package_quantity")!
    assert.match(row.hint ?? "", /Also needs Fixed-cost report on net media on/)
  })
})

describe("combinePackageQuantity", () => {
  it("is on only with both switches on", () => {
    assert.equal(combinePackageQuantity(true, true), true)
    assert.equal(combinePackageQuantity(true, false), false)
    assert.equal(combinePackageQuantity(false, true), false)
    assert.equal(combinePackageQuantity(false, false), false)
  })
})

describe("getters", () => {
  it("server: the package switch alone is off", async () => {
    const read = (on: string[]) => readDeliveryFlags(async (key) => on.includes(key))
    assert.equal((await read(["expert_package_quantity"])).packageNoUnitTarget, false)
    assert.equal((await read(["expert_package_quantity", "fixed_cost_report_net"])).packageNoUnitTarget, true)
    // The net switch keeps its own meaning either way.
    assert.equal((await read(["fixed_cost_report_net"])).fixedCostReportNet, true)
  })

  it("browser: the package switch alone is off", () => {
    try {
      setClientFeatureSnapshot({ expert_package_quantity: true })
      assert.equal(deliveryFlagsFromClient().packageNoUnitTarget, false)
      setClientFeatureSnapshot({ expert_package_quantity: true, fixed_cost_report_net: true })
      assert.equal(deliveryFlagsFromClient().packageNoUnitTarget, true)
    } finally {
      setClientFeatureSnapshot(null)
    }
  })
})

describe("expert grid Apply follows the same rule", () => {
  const CS = new Date(2026, 0, 4)
  const CE = new Date(2026, 0, 31)
  const cols = buildWeeklyGanttColumnsFromCampaign(CS, CE)
  const weekKeys = cols.map((c) => c.weekKey)

  function socialPackageDeliverables(): number {
    const r = rowsCfg.createEmptySocialMediaExpertRow("r1", CS, CE, weekKeys)
    const row = { ...r, buyType: "package", unitRate: 250, weeklyValues: { ...r.weeklyValues, [weekKeys[1]!]: 3 } }
    const [line] = maps.mapSocialMediaExpertRowsToStandardLineItems([row], cols, CS, CE)
    return (line!.bursts as Array<{ calculatedValue?: unknown }>).reduce(
      (sum, b) => sum + Number(b.calculatedValue ?? 0),
      0,
    )
  }

  it("package switch alone: the old 0; with the net switch: the quantity", () => {
    try {
      setClientFeatureSnapshot(null)
      assert.equal(socialPackageDeliverables(), 0)
      setClientFeatureSnapshot({ expert_package_quantity: true })
      assert.equal(socialPackageDeliverables(), 0)
      setClientFeatureSnapshot({ expert_package_quantity: true, fixed_cost_report_net: true })
      assert.equal(socialPackageDeliverables(), 3)
    } finally {
      setClientFeatureSnapshot(null)
    }
  })
})
