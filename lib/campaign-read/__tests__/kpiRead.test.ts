import assert from "node:assert/strict"
import { test } from "node:test"

import { buildKpiReview, type KpiReviewGroup } from "@/lib/kpi/kpiReview"
import type { CampaignKPI } from "@/lib/kpi/types"

import { compactKpiReviewForRead, kpiRowEligibleForReadBeat } from "../kpiRead"

function kpi(
  partial: Partial<CampaignKPI> & Pick<CampaignKPI, "mba_number" | "line_item_id">,
): CampaignKPI {
  return {
    mp_client_name: "Test",
    version_number: 1,
    campaign_name: "Camp",
    media_type: "socialmedia",
    publisher: "meta",
    bid_strategy: "cpm",
    ctr: null,
    cpv: null,
    conversion_rate: null,
    vtr: null,
    frequency: null,
    ...partial,
  }
}

test("a not-tracked KPI is not eligible for best/worst", () => {
  const group: KpiReviewGroup = {
    key: "social-meta",
    label: "Social · Meta",
    colour: "var(--channel-social)",
    lineItemIds: ["bicau002sm1"],
    plannedSpendByLineId: { bicau002sm1: 10_000 },
    planByLineId: {},
    impressions: 100_000,
    clicks: 2_000,
    results: 0,
    views: 40_000,
    completes: null,
    spend: 4_000,
    spendModelled: false,
    vtrTracked: false,
  }
  const cards = buildKpiReview({
    groups: [group],
    lineItemTargets: new Map([
      [
        "bicau002|1|bicau002sm1",
        kpi({
          mba_number: "BICAU002",
          line_item_id: "bicau002sm1",
          vtr: 0.4,
          ctr: 0.02,
        }),
      ],
    ]),
    isAdmin: true,
  })
  const vtr = cards[0]?.rows.find((row) => row.metric === "vtr")
  const ctr = cards[0]?.rows.find((row) => row.metric === "ctr")
  assert.equal(vtr?.deliveredDisplay, "Not tracked for this source")
  assert.equal(kpiRowEligibleForReadBeat(vtr!), false)
  assert.equal(kpiRowEligibleForReadBeat(ctr!), true)

  const compact = compactKpiReviewForRead(cards) as Array<{
    rows: Array<{ metric: string; eligibleForBestWorst: boolean }>
  }>
  assert.equal(compact[0]?.rows.find((row) => row.metric === "vtr")?.eligibleForBestWorst, false)
  assert.equal(compact[0]?.rows.find((row) => row.metric === "ctr")?.eligibleForBestWorst, true)
})
