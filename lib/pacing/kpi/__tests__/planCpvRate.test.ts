import assert from "node:assert/strict"
import { test } from "node:test"

import type { CampaignKPI } from "@/lib/kpi/types"
import { programmaticFixture, socialFixture } from "../../channel/__tests__/fixtures"
import { buildProgrammaticKpiComparisons } from "../../programmatic/computeProgrammaticKpiStatus"
import { buildSocialKpiComparisons } from "../../social/computeSocialKpiStatus"
import { kpiPlanLineFromPlanItem, planCpvRateForLine } from "../planCpvRate"

function kpiRow(overrides: Partial<CampaignKPI>): CampaignKPI {
  return {
    mp_client_name: "Penfolds",
    mba_number: "PENFOLD020",
    version_number: 3,
    campaign_name: "Brand",
    media_type: "socialMedia",
    publisher: "meta",
    bid_strategy: "",
    line_item_id: "penfold020sm1",
    ctr: null,
    cpv: null,
    conversion_rate: null,
    vtr: null,
    frequency: null,
    ...overrides,
  }
}

const CPV_LINE = {
  line_item_id: "penfold020sm1",
  buy_type: "cpv",
  bursts: [
    { start_date: "2026-10-01", end_date: "2026-10-31", budget: 5_000, buy_amount: 0.04, calculated_value: 125_000 },
  ],
}

test("a CPV buy uses the plan's buy rate, not the saved cpv", () => {
  const planLine = kpiPlanLineFromPlanItem(CPV_LINE, 5_000)
  const rate = planCpvRateForLine({
    lineItemId: "penfold020sm1",
    planLine,
    kpiRow: kpiRow({ cpv: 0.07 }),
  })
  assert.equal(rate, 0.04)
})

test("a views buy without a CPV rate derives spend over planned views", () => {
  const planLine = kpiPlanLineFromPlanItem(
    {
      line_item_id: "x1",
      buy_type: "cpm",
      views: 50_000,
      bursts: [{ start_date: "2026-10-01", end_date: "2026-10-31", budget: 2_000, buy_amount: 10 }],
    },
    2_000,
  )
  assert.equal(planCpvRateForLine({ lineItemId: "x1", planLine }), 0.04)
})

test("an impressions buy derives the rate from the saved VTR target", () => {
  const planLine = kpiPlanLineFromPlanItem(
    {
      line_item_id: "x2",
      buy_type: "cpm",
      bursts: [
        { start_date: "2026-10-01", end_date: "2026-10-31", budget: 1_000, buy_amount: 10, calculated_value: 100_000 },
      ],
    },
    1_000,
  )
  const rate = planCpvRateForLine({ lineItemId: "x2", planLine, kpiRow: kpiRow({ line_item_id: "x2", vtr: 0.25 }) })
  // $1,000 / (100,000 impressions x 25%) = $0.04.
  assert.equal(rate, 0.04)
})

test("a line with no plan rate has no CPV target even with a saved cpv", () => {
  const planLine = kpiPlanLineFromPlanItem(
    {
      line_item_id: "x3",
      buy_type: "cpc",
      bursts: [{ start_date: "2026-10-01", end_date: "2026-10-31", budget: 1_000, buy_amount: 2, calculated_value: 500 }],
    },
    1_000,
  )
  assert.equal(planCpvRateForLine({ lineItemId: "x3", planLine, kpiRow: kpiRow({ line_item_id: "x3", cpv: 0.1 }) }), null)
  assert.equal(planCpvRateForLine({ lineItemId: "x3", planLine: null }), null)
})

test("social KPI cells compare CPV to the plan rate and ignore the saved cpv", () => {
  const base = socialFixture()
  const row = socialFixture({
    kpiTargets: { ...base.kpiTargets!, cpv: 0.1 },
    planCpvRate: 0.04,
    cpv: 0.05,
  })
  const cpv = buildSocialKpiComparisons(row).find((c) => c.metric === "cpv")
  assert.equal(cpv?.target, 0.04)
  assert.equal(cpv?.status, "off-target")

  const noPlan = socialFixture({ kpiTargets: { ...base.kpiTargets!, cpv: 0.1 }, planCpvRate: null })
  assert.equal(buildSocialKpiComparisons(noPlan).find((c) => c.metric === "cpv")?.status, "no-target")
})

test("programmatic KPI cells compare CPV to the plan rate and ignore the saved cpv", () => {
  const base = programmaticFixture()
  const targets = base.kpiTargets ?? {
    mediaType: null,
    publisher: null,
    bidStrategy: null,
    ctr: null,
    cpv: null,
    conversionRate: null,
    vtr: null,
    frequency: null,
  }
  const row = programmaticFixture({
    kpiTargets: { ...targets, cpv: 0.38 },
    planCpvRate: 0.08,
    cpv: 0.08,
  })
  const cpv = buildProgrammaticKpiComparisons(row).find((c) => c.metric === "cpv")
  assert.equal(cpv?.target, 0.08)
  assert.equal(cpv?.status, "on-track")
})
