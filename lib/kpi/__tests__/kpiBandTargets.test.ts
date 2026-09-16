import { describe, it } from "node:test"
import assert from "node:assert/strict"

import { applyKpiBandTargets } from "@/lib/kpi/kpiBandTargets"
import { lineItemKpiKey } from "@/lib/kpi/lineItemKpiTargets"
import { buildKpiReview, type KpiReviewGroup } from "@/lib/kpi/kpiReview"
import type { CampaignKPI } from "@/lib/kpi/types"
import type { KpiTileProps } from "@/components/dashboard/delivery/shared/KpiTile"

function kpi(partial: Partial<CampaignKPI> & Pick<CampaignKPI, "mba_number" | "line_item_id">): CampaignKPI {
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

function targets(rows: CampaignKPI[]): Map<string, CampaignKPI> {
  const map = new Map<string, CampaignKPI>()
  for (const row of rows) {
    const id = row.line_item_id?.trim()
    if (!id) continue
    map.set(lineItemKpiKey(row.mba_number, row.version_number, id), row)
  }
  return map
}

function metaGroup(partial: Partial<KpiReviewGroup> = {}): KpiReviewGroup {
  return {
    key: "social-meta",
    label: "Social · Meta",
    colour: "var(--channel-social)",
    lineItemIds: ["bicau002sm1"],
    plannedSpendByLineId: { bicau002sm1: 10_000 },
    planByLineId: {
      bicau002sm1: {
        buyType: "cpm",
        plannedSpend: 10_000,
        buyAmount: 12,
        plannedViews: null,
        plannedImpressions: 800_000,
      },
    },
    impressions: 100_000,
    clicks: 2_000,
    results: 80,
    views: 40_000,
    completes: null,
    spend: 4_000,
    spendModelled: false,
    vtrTracked: false,
    ...partial,
  }
}

function bvodGroup(partial: Partial<KpiReviewGroup> = {}): KpiReviewGroup {
  return {
    key: "bvod",
    label: "BVOD",
    colour: "var(--channel-bvod)",
    lineItemIds: ["mba001bv1"],
    plannedSpendByLineId: { mba001bv1: 10_000 },
    planByLineId: {
      mba001bv1: {
        buyType: "cpm",
        plannedSpend: 10_000,
        buyAmount: 18,
        plannedViews: 200_000,
        plannedImpressions: 500_000,
      },
    },
    impressions: 80_000,
    clicks: 400,
    results: 0,
    views: 80_000,
    completes: 32_000,
    spend: 4_000,
    spendModelled: false,
    vtrTracked: false,
    ...partial,
  }
}

function tiles(...labels: string[]): KpiTileProps[] {
  return labels.map((label) => ({ label, value: "—" }))
}

describe("KPI band targets share the review resolver", () => {
  it("Meta band CTR matches the review row for a saved plan target", () => {
    const group = metaGroup()
    const lineItemTargets = targets([
      kpi({ mba_number: "BICAU002", line_item_id: "bicau002sm1", ctr: 0.02 }),
    ])
    const review = buildKpiReview({ groups: [group], lineItemTargets, isAdmin: true })
    const row = review[0]?.rows.find((r) => r.metric === "ctr")
    const [tile] = applyKpiBandTargets(tiles("CTR"), {
      group,
      lineItemTargets,
      isAdmin: true,
    })

    assert.equal(tile?.expected, row?.targetDisplay)
    assert.equal(tile?.expected, "2.00%")
    assert.equal(tile?.caption, "plan target")
    assert.equal(tile?.status, row?.status)
    assert.equal(tile?.status, "on-track")
  })

  it("BVOD band CPV matches the derived review row", () => {
    const group = bvodGroup()
    const lineItemTargets = targets([])
    const review = buildKpiReview({ groups: [group], lineItemTargets, isAdmin: true })
    const row = review[0]?.rows.find((r) => r.metric === "cpv")
    const [tile] = applyKpiBandTargets(tiles("CPV"), {
      group,
      lineItemTargets,
      isAdmin: true,
    })

    assert.equal(row?.targetDisplay, "$0.05")
    assert.equal(row?.targetCaption, "plan rate, derived")
    assert.equal(tile?.expected, row?.targetDisplay)
    assert.equal(tile?.caption, row?.targetCaption)
    assert.equal(tile?.status, row?.status)
  })

  it("no saved targets: admin No target saved, client Target pending, no pill", () => {
    const group = metaGroup({
      planByLineId: {
        bicau002sm1: {
          buyType: "cpm",
          plannedSpend: 10_000,
          buyAmount: 12,
          plannedViews: null,
          plannedImpressions: null,
        },
      },
    })
    const lineItemTargets = targets([])

    const admin = applyKpiBandTargets(tiles("CTR", "CPC"), {
      group,
      lineItemTargets,
      isAdmin: true,
    })
    assert.equal(admin[0]?.expected, undefined)
    assert.equal(admin[0]?.caption, "No target saved")
    assert.equal(admin[0]?.status, undefined)
    assert.equal(admin[1]?.expected, undefined)
    assert.equal(admin[1]?.caption, "No click basis")
    assert.equal(admin[1]?.status, undefined)

    const client = applyKpiBandTargets(tiles("CTR"), {
      group,
      lineItemTargets,
      isAdmin: false,
    })
    assert.equal(client[0]?.expected, undefined)
    assert.equal(client[0]?.caption, "Target pending")
    assert.equal(client[0]?.status, undefined)
  })

  it("leaves CPA unchanged", () => {
    const [tile] = applyKpiBandTargets([{ label: "CPA", value: "$12.00", caption: "keep" }], {
      group: metaGroup(),
      lineItemTargets: targets([]),
      isAdmin: true,
    })
    assert.equal(tile?.value, "$12.00")
    assert.equal(tile?.caption, "keep")
    assert.equal(tile?.expected, undefined)
  })
})
