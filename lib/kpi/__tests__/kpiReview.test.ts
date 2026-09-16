import { describe, it } from "node:test"
import assert from "node:assert/strict"

import { lineItemKpiKey } from "@/lib/kpi/lineItemKpiTargets"
import {
  buildKpiReview,
  buildKpiReviewGroups,
  indexLineDeliveryActuals,
  shouldShowKpiReview,
  type KpiReviewGroup,
} from "@/lib/kpi/kpiReview"
import type { CampaignKPI } from "@/lib/kpi/types"

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

function socialGroup(partial: Partial<KpiReviewGroup> = {}): KpiReviewGroup {
  return {
    key: "social-meta",
    label: "Social · Meta",
    colour: "var(--channel-social)",
    lineItemIds: ["bicau002sm1"],
    plannedSpendByLineId: { "bicau002sm1": 10_000 },
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

describe("buildKpiReview targets", () => {
  it("uses the shared line target when every line agrees", () => {
    const cards = buildKpiReview({
      groups: [
        socialGroup({
          lineItemIds: ["a", "b"],
          plannedSpendByLineId: { a: 8_000, b: 2_000 },
        }),
      ],
      lineItemTargets: targets([
        kpi({ mba_number: "BICAU002", line_item_id: "a", ctr: 0.02 }),
        kpi({ mba_number: "BICAU002", line_item_id: "b", ctr: 0.02 }),
      ]),
      isAdmin: false,
    })
    const ctr = cards[0]?.rows.find((r) => r.metric === "ctr")
    assert.equal(ctr?.targetDisplay, "2.00%")
    assert.equal(ctr?.omitted, false)
  })

  it("weights disagreeing targets by planned spend", () => {
    const cards = buildKpiReview({
      groups: [
        socialGroup({
          lineItemIds: ["a", "b"],
          plannedSpendByLineId: { a: 75_000, b: 25_000 },
          impressions: 100_000,
          clicks: 1_000,
        }),
      ],
      lineItemTargets: targets([
        kpi({ mba_number: "BICAU002", line_item_id: "a", ctr: 0.02 }),
        kpi({ mba_number: "BICAU002", line_item_id: "b", ctr: 0.06 }),
      ]),
      isAdmin: false,
    })
    const ctr = cards[0]?.rows.find((r) => r.metric === "ctr")
    // 0.02*75000 + 0.06*25000 = 3000 / 100000 = 0.03 → 3.00%
    assert.equal(ctr?.targetDisplay, "3.00%")
  })

  it("omits 0 and null targets for clients and greys them for admins", () => {
    const group = socialGroup({
      lineItemIds: ["a"],
      plannedSpendByLineId: { a: 10_000 },
    })
    const lineItemTargets = targets([
      kpi({ mba_number: "BICAU002", line_item_id: "a", ctr: 0, conversion_rate: null, cpv: 0.12 }),
    ])
    const client = buildKpiReview({ groups: [group], lineItemTargets, isAdmin: false })
    assert.equal(client[0]?.rows.some((r) => r.metric === "ctr"), false)
    assert.equal(client[0]?.rows.some((r) => r.metric === "conversion_rate"), false)
    assert.ok(client[0]?.rows.some((r) => r.metric === "cpv"))

    const admin = buildKpiReview({ groups: [group], lineItemTargets, isAdmin: true })
    const ctr = admin[0]?.rows.find((r) => r.metric === "ctr")
    assert.equal(ctr?.omitted, true)
    assert.equal(ctr?.targetDisplay, "No target set")
    assert.equal(ctr?.targetSource, null)
  })

  it("stamps plan target source on a saved campaign_kpi value", () => {
    const cards = buildKpiReview({
      groups: [socialGroup()],
      lineItemTargets: targets([
        kpi({ mba_number: "BICAU002", line_item_id: "bicau002sm1", ctr: 0.02 }),
      ]),
      isAdmin: false,
    })
    const ctr = cards[0]?.rows.find((r) => r.metric === "ctr")
    assert.equal(ctr?.targetSource, "target")
    assert.equal(ctr?.benchmarkRef ?? null, null)
  })

  it("stamps industry benchmark source and ref from campaign_kpi", () => {
    const cards = buildKpiReview({
      groups: [socialGroup()],
      lineItemTargets: targets([
        kpi({
          mba_number: "BICAU002",
          line_item_id: "bicau002sm1",
          ctr: 0.015,
          target_source: "benchmark",
          benchmark_ref: "IAB AU 2025 display",
        }),
      ]),
      isAdmin: false,
    })
    const ctr = cards[0]?.rows.find((r) => r.metric === "ctr")
    assert.equal(ctr?.targetSource, "benchmark")
    assert.equal(ctr?.benchmarkRef, "IAB AU 2025 display")
  })

  it("marks a card noTargets when every metric is unset", () => {
    const group = socialGroup()
    const empty = targets([])
    const admin = buildKpiReview({ groups: [group], lineItemTargets: empty, isAdmin: true })
    assert.equal(admin.length, 1)
    assert.equal(admin[0]?.noTargets, true)
    assert.equal(admin[0]?.rows.length, 0)
    assert.equal(shouldShowKpiReview(admin, true), true)

    const client = buildKpiReview({ groups: [group], lineItemTargets: empty, isAdmin: false })
    assert.equal(client.length, 1)
    assert.equal(client[0]?.noTargets, true)
    assert.equal(shouldShowKpiReview(client, false), false)
  })

  it("keeps a mixed card's rows and still gates clients on any saved or benchmark target", () => {
    const mixed = buildKpiReview({
      groups: [
        socialGroup({
          key: "social-meta",
          lineItemIds: ["a"],
          plannedSpendByLineId: { a: 10_000 },
        }),
        socialGroup({
          key: "bvod",
          label: "BVOD",
          lineItemIds: ["b"],
          plannedSpendByLineId: { b: 8_000 },
        }),
      ],
      lineItemTargets: targets([
        kpi({ mba_number: "BICAU002", line_item_id: "a", ctr: 0.02 }),
      ]),
      isAdmin: false,
    })
    assert.equal(mixed.find((c) => c.key === "social-meta")?.noTargets, false)
    assert.equal(mixed.find((c) => c.key === "bvod")?.noTargets, true)
    assert.equal(shouldShowKpiReview(mixed, false), true)
  })
})

describe("buildKpiReview delivered", () => {
  it("computes ctr = clicks/impressions and conversion_rate = results/clicks", () => {
    const cards = buildKpiReview({
      groups: [socialGroup({ impressions: 200_000, clicks: 4_000, results: 80 })],
      lineItemTargets: targets([
        kpi({ mba_number: "BICAU002", line_item_id: "bicau002sm1", ctr: 0.02, conversion_rate: 0.02 }),
      ]),
      isAdmin: false,
    })
    const ctr = cards[0]?.rows.find((r) => r.metric === "ctr")
    const cvr = cards[0]?.rows.find((r) => r.metric === "conversion_rate")
    assert.equal(ctr?.deliveredDisplay, "2.00%")
    assert.equal(cvr?.deliveredDisplay, "2.00%")
  })

  it("computes cpv = spend/views and tags modelled spend", () => {
    const cards = buildKpiReview({
      groups: [
        socialGroup({
          spend: 200,
          views: 1_000,
          spendModelled: true,
        }),
      ],
      lineItemTargets: targets([kpi({ mba_number: "BICAU002", line_item_id: "bicau002sm1", cpv: 0.25 })]),
      isAdmin: false,
    })
    const cpv = cards[0]?.rows.find((r) => r.metric === "cpv")
    assert.equal(cpv?.deliveredDisplay, "$0.20")
    assert.equal(cpv?.modelled, true)
  })

  it("does not invent $0 CPV when spend is hidden (ZERO-$ LAW)", () => {
    const cards = buildKpiReview({
      groups: [socialGroup({ spend: null, views: 1_000 })],
      lineItemTargets: targets([kpi({ mba_number: "BICAU002", line_item_id: "bicau002sm1", cpv: 0.25 })]),
      isAdmin: false,
    })
    const cpv = cards[0]?.rows.find((r) => r.metric === "cpv")
    assert.equal(cpv?.deliveredDisplay, "—")
    assert.equal(cpv?.status, "no-data")
  })

  it("marks VTR not tracked for Meta and CM360, computed for Channel Factory completes", () => {
    const meta = buildKpiReview({
      groups: [socialGroup({ vtrTracked: false, completes: null })],
      lineItemTargets: targets([kpi({ mba_number: "BICAU002", line_item_id: "bicau002sm1", vtr: 0.4 })]),
      isAdmin: false,
    })
    assert.equal(meta[0]?.rows.find((r) => r.metric === "vtr")?.deliveredDisplay, "Not tracked for this source")

    const factory = buildKpiReview({
      groups: [
        socialGroup({
          key: "programmatic-video:channel factory",
          label: "Prog Video · Channel Factory",
          vtrTracked: true,
          impressions: 10_000,
          completes: 4_000,
        }),
      ],
      lineItemTargets: targets([kpi({ mba_number: "BICAU002", line_item_id: "bicau002sm1", vtr: 0.5 })]),
      isAdmin: false,
    })
    assert.equal(factory[0]?.rows.find((r) => r.metric === "vtr")?.deliveredDisplay, "40.00%")
  })

  it("marks frequency as not tracked yet", () => {
    const cards = buildKpiReview({
      groups: [socialGroup()],
      lineItemTargets: targets([kpi({ mba_number: "BICAU002", line_item_id: "bicau002sm1", frequency: 2 })]),
      isAdmin: false,
    })
    const freq = cards[0]?.rows.find((r) => r.metric === "frequency")
    assert.equal(freq?.deliveredDisplay, "Not tracked yet")
    assert.equal(freq?.status, "no-data")
  })
})

describe("buildKpiReview status", () => {
  it("uses higher-is-better pct for ctr", () => {
    const behind = buildKpiReview({
      groups: [socialGroup({ impressions: 100_000, clicks: 1_000 })],
      lineItemTargets: targets([kpi({ mba_number: "BICAU002", line_item_id: "bicau002sm1", ctr: 0.02 })]),
      isAdmin: false,
    })
    assert.equal(behind[0]?.rows.find((r) => r.metric === "ctr")?.status, "behind")

    const ahead = buildKpiReview({
      groups: [socialGroup({ impressions: 100_000, clicks: 3_000 })],
      lineItemTargets: targets([kpi({ mba_number: "BICAU002", line_item_id: "bicau002sm1", ctr: 0.02 })]),
      isAdmin: false,
    })
    assert.equal(ahead[0]?.rows.find((r) => r.metric === "ctr")?.status, "ahead")
  })

  it("uses lower-is-better pct for cpv", () => {
    const ahead = buildKpiReview({
      groups: [socialGroup({ spend: 100, views: 1_000 })],
      lineItemTargets: targets([kpi({ mba_number: "BICAU002", line_item_id: "bicau002sm1", cpv: 0.2 })]),
      isAdmin: false,
    })
    // target 0.20 / delivered 0.10 * 100 = 200 → ahead (cheaper than target)
    assert.equal(ahead[0]?.rows.find((r) => r.metric === "cpv")?.status, "ahead")
  })

  it("never averages targets across channel groups", () => {
    const cards = buildKpiReview({
      groups: [
        socialGroup({
          key: "social-meta",
          lineItemIds: ["a"],
          plannedSpendByLineId: { a: 10_000 },
        }),
        socialGroup({
          key: "programmatic-video:channel factory",
          label: "Prog Video · Channel Factory",
          lineItemIds: ["b"],
          plannedSpendByLineId: { b: 10_000 },
          vtrTracked: true,
        }),
      ],
      lineItemTargets: targets([
        kpi({ mba_number: "BICAU002", line_item_id: "a", ctr: 0.01 }),
        kpi({ mba_number: "BICAU002", line_item_id: "b", ctr: 0.05 }),
      ]),
      isAdmin: false,
    })
    assert.equal(cards[0]?.rows.find((r) => r.metric === "ctr")?.targetDisplay, "1.00%")
    assert.equal(cards[1]?.rows.find((r) => r.metric === "ctr")?.targetDisplay, "5.00%")
  })
})

describe("indexLineDeliveryActuals + buildKpiReviewGroups", () => {
  it("sums PACING_FACT rows onto coverage drafts and flags Channel Factory VTR", () => {
    const actuals = indexLineDeliveryActuals({
      pacingRows: [
        {
          lineItemId: "CF1",
          impressions: 1_000,
          clicks: 10,
          results: 0,
          video3sViews: 400,
        },
        {
          lineItemId: "cf1",
          impressions: 1_000,
          clicks: 10,
          results: 0,
          video3sViews: 200,
        },
      ],
      searchLineItems: [],
    })
    const groups = buildKpiReviewGroups({
      drafts: [
        {
          key: "programmatic-video:channel factory",
          label: "Prog Video · Channel Factory",
          colour: "var(--channel-bvod)",
          family: "programmatic-video",
          deliverySource: "partner_file",
          lineItemIds: ["cf1"],
          plannedSpendByLineId: { cf1: 5_000 },
        },
      ],
      coverage: [
        {
          key: "programmatic-video:channel factory",
          label: "Prog Video · Channel Factory",
          colour: "var(--channel-bvod)",
          plannedSpend: 5_000,
          plannedImpressions: 10_000,
          deliveredSpend: 0,
          deliveredImpressions: 2_000,
          status: "reporting",
          spendModelled: false,
          startsOn: null,
          deliveryStatus: "on-track",
          impressionsStatus: "on-track",
          deliverableLabel: "Views",
        },
      ],
      actualsByLineId: actuals,
    })
    assert.equal(groups.length, 1)
    assert.equal(groups[0]?.impressions, 2_000)
    assert.equal(groups[0]?.clicks, 20)
    assert.equal(groups[0]?.views, 600)
    assert.equal(groups[0]?.completes, 600)
    assert.equal(groups[0]?.vtrTracked, true)
  })

  it("skips awaiting-delivery drafts", () => {
    const groups = buildKpiReviewGroups({
      drafts: [
        {
          key: "no-source",
          label: "Awaiting delivery",
          colour: "var(--channel-social)",
          family: "no-source",
          deliverySource: undefined,
          lineItemIds: ["x"],
          plannedSpendByLineId: { x: 1 },
        },
      ],
      coverage: [],
      actualsByLineId: new Map(),
    })
    assert.equal(groups.length, 0)
  })
})
