import { describe, it } from "node:test"
import assert from "node:assert/strict"

import { lineItemKpiKey } from "@/lib/kpi/lineItemKpiTargets"
import {
  buildKpiReview,
  buildKpiReviewGroups,
  extractKpiReviewPlanLine,
  indexLineDeliveryActuals,
  resolveCpmPlanRate,
  shouldShowKpiReview,
  type KpiReviewGroup,
  type KpiReviewPlanLine,
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
    planByLineId: {},
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
      kpi({ mba_number: "BICAU002", line_item_id: "a", ctr: 0, conversion_rate: null, frequency: 3 }),
    ])
    const client = buildKpiReview({ groups: [group], lineItemTargets, isAdmin: false })
    assert.equal(client[0]?.rows.some((r) => r.metric === "ctr"), false)
    assert.equal(client[0]?.rows.some((r) => r.metric === "conversion_rate"), false)
    assert.ok(client[0]?.rows.some((r) => r.metric === "frequency"))

    const admin = buildKpiReview({ groups: [group], lineItemTargets, isAdmin: true })
    const ctr = admin[0]?.rows.find((r) => r.metric === "ctr")
    assert.equal(ctr?.omitted, true)
    assert.equal(ctr?.targetDisplay, "No target set")
    assert.equal(ctr?.targetSource, null)
  })

  it("ignores a leftover campaign_kpi.cpv value when every entered metric is unset", () => {
    const group = socialGroup({
      lineItemIds: ["a"],
      plannedSpendByLineId: { a: 10_000 },
    })
    const lineItemTargets = targets([
      kpi({ mba_number: "BICAU002", line_item_id: "a", cpv: 0.12 }),
    ])
    const client = buildKpiReview({ groups: [group], lineItemTargets, isAdmin: false })
    assert.equal(client[0]?.noTargets, true)
    assert.equal(client[0]?.rows.length, 0)
    assert.equal(shouldShowKpiReview(client, false), false)
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

  it("shows the review only for an admin when any card has a target", () => {
    const cards = buildKpiReview({
      groups: [socialGroup()],
      lineItemTargets: targets([
        kpi({ mba_number: "BICAU002", line_item_id: "bicau002sm1", ctr: 0.02 }),
      ]),
      isAdmin: false,
    })
    assert.equal(cards[0]?.noTargets, false)
    assert.equal(shouldShowKpiReview(cards, false), false)
    assert.equal(shouldShowKpiReview(cards, true), true)
    assert.equal(shouldShowKpiReview([], true), false)
  })

  it("keeps a mixed card's rows and still hides the section from non-admins", () => {
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
    assert.equal(shouldShowKpiReview(mixed, false), false)
    assert.equal(shouldShowKpiReview(mixed, true), true)
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
          planByLineId: {
            bicau002sm1: {
              buyType: "cpv",
              plannedSpend: 10_000,
              buyAmount: 0.25,
              plannedViews: 40_000,
              plannedImpressions: null,
            },
          },
        }),
      ],
      lineItemTargets: targets([kpi({ mba_number: "BICAU002", line_item_id: "bicau002sm1", cpv: 0.25 })]),
      isAdmin: false,
    })
    const cpv = cards[0]?.rows.find((r) => r.metric === "cpv")
    assert.equal(cpv?.deliveredDisplay, "$0.20")
    assert.equal(cpv?.modelled, true)
  })

  it("shows estimated CPM and CPV, and hides CPC when clicks are not the unit", () => {
    const cards = buildKpiReview({
      groups: [
        socialGroup({
          key: "digital-display",
          spend: 2_000,
          spendEstimated: true,
          impressions: 100_000,
          clicks: 40,
          views: 0,
          planByLineId: {
            bicau002sm1: {
              buyType: "cpm",
              plannedSpend: 10_000,
              buyAmount: null,
              plannedViews: null,
              plannedImpressions: 500_000,
            },
          },
        }),
      ],
      lineItemTargets: targets([]),
      isAdmin: true,
    })
    const cpmRow = cards[0]?.rows.find((row) => row.metric === "cpm")
    const cpv = cards[0]?.rows.find((row) => row.metric === "cpv")
    const cpc = cards[0]?.rows.find((row) => row.metric === "cpc")
    assert.equal(cpmRow?.deliveredDisplay, "$20.00")
    assert.equal(cpmRow?.spendEstimated, true)
    assert.equal(cpv?.spendEstimated, false)
    assert.equal(cpc, undefined)
  })

  it("does not invent $0 CPV when spend is hidden", () => {
    const cards = buildKpiReview({
      groups: [
        socialGroup({
          spend: null,
          views: 1_000,
          planByLineId: {
            bicau002sm1: {
              buyType: "cpv",
              plannedSpend: 10_000,
              buyAmount: 0.25,
              plannedViews: 40_000,
              plannedImpressions: null,
            },
          },
        }),
      ],
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
      groups: [
        socialGroup({
          spend: 100,
          views: 1_000,
          planByLineId: {
            bicau002sm1: {
              buyType: "cpv",
              plannedSpend: 10_000,
              buyAmount: 0.2,
              plannedViews: 50_000,
              plannedImpressions: null,
            },
          },
        }),
      ],
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
          planByLineId: {},
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
          planByLineId: {},
        },
      ],
      coverage: [],
      actualsByLineId: new Map(),
    })
    assert.equal(groups.length, 0)
  })
})

describe("CPV is a plan rate, not an entered target", () => {
  it("uses the budget-weighted buyAmount for a cpv-bought channel (BICAU002 Channel Factory)", () => {
    const group: KpiReviewGroup = {
      key: "programmatic-video:channel factory",
      label: "Prog Video · Channel Factory",
      colour: "var(--channel-bvod)",
      lineItemIds: ["BICAU002-CF-1"],
      plannedSpendByLineId: { "BICAU002-CF-1": 30_400 },
      planByLineId: {
        "BICAU002-CF-1": {
          buyType: "cpv",
          plannedSpend: 30_400,
          buyAmount: 0.09,
          plannedViews: 337_777,
          plannedImpressions: null,
        },
      },
      impressions: 0,
      clicks: 0,
      results: 0,
      views: 337_746,
      completes: 337_746,
      spend: 20_376,
      spendModelled: false,
      vtrTracked: true,
    }

    const cards = buildKpiReview({
      groups: [group],
      lineItemTargets: targets([
        kpi({
          mba_number: "BICAU002",
          line_item_id: "BICAU002-CF-1",
          cpv: 0.25,
        }),
      ]),
      isAdmin: false,
    })
    const row = cards[0]?.rows.find((r) => r.metric === "cpv")
    assert.equal(row?.targetDisplay, "$0.09")
    assert.equal(row?.targetSource, "target")
    assert.equal(row?.targetCaption, "plan rate")
    assert.equal(row?.deliveredDisplay, "$0.06")
    assert.equal(row?.status, "ahead")
    assert.equal(row?.omitted, false)
    assert.equal(cards[0]?.noTargets, false)
    assert.equal(shouldShowKpiReview(cards, false), false)
    assert.equal(shouldShowKpiReview(cards, true), true)
  })

  it("derives CPV from planned spend ÷ planned views for a cpm-bought video channel", () => {
    const group: KpiReviewGroup = {
      ...socialGroup(),
      key: "social-youtube",
      label: "Social · YouTube",
      lineItemIds: ["YT-1"],
      plannedSpendByLineId: { "YT-1": 10_000 },
      planByLineId: {
        "YT-1": {
          buyType: "cpm",
          plannedSpend: 10_000,
          buyAmount: 12,
          plannedViews: 200_000,
          plannedImpressions: 500_000,
        },
      },
      views: 80_000,
      spend: 4_000,
    }

    const cards = buildKpiReview({
      groups: [group],
      lineItemTargets: targets([
        kpi({ mba_number: "BICAU002", line_item_id: "YT-1", cpv: 0.4 }),
      ]),
      isAdmin: false,
    })
    const row = cards[0]?.rows.find((r) => r.metric === "cpv")
    assert.equal(row?.targetDisplay, "$0.05")
    assert.equal(row?.targetCaption, "plan rate, derived")
    assert.equal(row?.deliveredDisplay, "$0.05")
    assert.equal(row?.status, "on-track")
  })

  it("reads Not a view buy for a display channel with no view basis", () => {
    const group: KpiReviewGroup = {
      ...socialGroup({ views: 0 }),
      key: "programmatic-display",
      label: "Prog Display · DV360",
      lineItemIds: ["GDN-1"],
      plannedSpendByLineId: { "GDN-1": 8_000 },
      planByLineId: {
        "GDN-1": {
          buyType: "cpm",
          plannedSpend: 8_000,
          buyAmount: 4.5,
          plannedViews: null,
          plannedImpressions: 1_800_000,
        },
      },
      impressions: 900_000,
      clicks: 9_000,
      spend: 4_000,
    }

    const cards = buildKpiReview({
      groups: [group],
      lineItemTargets: targets([
        kpi({ mba_number: "BICAU002", line_item_id: "GDN-1", ctr: 0.01, cpv: 0.12 }),
      ]),
      isAdmin: false,
    })
    const row = cards[0]?.rows.find((r) => r.metric === "cpv")
    assert.equal(row?.targetDisplay, "Not a view buy")
    assert.equal(row?.targetCaption ?? null, null)
    assert.equal(row?.targetSource, null)
    assert.equal(row?.deliveredDisplay, "Not tracked for this source")
    assert.equal(row?.status, "no-data")
  })

  it("extracts a budget-weighted CPV buyAmount from plan bursts", () => {
    const plan = extractKpiReviewPlanLine(
      {
        buy_type: "cpv",
        impressions: 337_777,
        bursts: [
          {
            startDate: "2026-01-01",
            endDate: "2026-03-31",
            budget: 30_400,
            buyAmount: 0.09,
            calculatedValue: 337_777,
          },
        ],
      },
      30_400,
    )
    assert.equal(plan.buyType, "cpv")
    assert.equal(plan.buyAmount, 0.09)
    assert.equal(plan.plannedViews, 337_777)
  })
})

function planLine(
  buyType: string,
  plannedSpend: number,
  plannedImpressions: number | null,
): KpiReviewPlanLine {
  return {
    buyType,
    plannedSpend,
    buyAmount: null,
    plannedViews: null,
    plannedImpressions,
  }
}

describe("resolveCpmPlanRate", () => {
  it("uses the plan CPM, not budget incl. fees, for fee-inclusive lines (BICAU006 shape)", () => {
    // Reddit SM2: $20,000 gross incl. 10% fee, $10 CPM, 1.8M impressions from $18,000 net.
    // Meta SM1: $48,000 gross, $12 CPM, 3.6M impressions.
    const reddit: KpiReviewGroup = {
      lineItemIds: ["bicau006sm2"],
      plannedSpendByLineId: { bicau006sm2: 20_000 },
      planByLineId: {
        bicau006sm2: { buyType: "cpm", plannedSpend: 20_000, buyAmount: 10, plannedViews: null, plannedImpressions: 1_800_000 },
      },
    } as unknown as KpiReviewGroup
    assert.equal(resolveCpmPlanRate(reddit)?.value, 10)
    const both: KpiReviewGroup = {
      lineItemIds: ["bicau006sm1", "bicau006sm2"],
      plannedSpendByLineId: { bicau006sm1: 48_000, bicau006sm2: 20_000 },
      planByLineId: {
        bicau006sm1: { buyType: "cpm", plannedSpend: 48_000, buyAmount: 12, plannedViews: null, plannedImpressions: 3_600_000 },
        bicau006sm2: { buyType: "cpm", plannedSpend: 20_000, buyAmount: 10, plannedViews: null, plannedImpressions: 1_800_000 },
      },
    } as unknown as KpiReviewGroup
    // (12 x 3.6M + 10 x 1.8M) / 5.4M = 11.333...
    assert.ok(Math.abs((resolveCpmPlanRate(both)?.value ?? 0) - 34 / 3) < 1e-9)
  })

  it("uses CPM lines only, as total media over total impressions, on a golf025-shaped group", () => {
    const lineItemIds = [
      "dd1",
      "dd2",
      "dd3",
      "dd4",
      "dd5",
      "dd6",
      "dd7",
      "dd8",
      "dd13",
      "dd11",
      "dd14",
      "dd15",
      "dd9",
      "dd10",
    ]
    const plannedSpendByLineId: Record<string, number> = {}
    const planByLineId: Record<string, KpiReviewPlanLine> = {}
    for (let i = 0; i < 8; i++) {
      const id = lineItemIds[i]!
      plannedSpendByLineId[id] = 8_000
      planByLineId[id] = planLine("cpm", 8_000, 400_000)
    }
    plannedSpendByLineId.dd13 = 6_592.74
    planByLineId.dd13 = planLine("cpm", 6_592.74, 701_362)
    plannedSpendByLineId.dd11 = 4_000
    planByLineId.dd11 = planLine("fixed_cost", 4_000, 1)
    plannedSpendByLineId.dd14 = 1_000
    planByLineId.dd14 = planLine("fixed_cost", 1_000, 1)
    plannedSpendByLineId.dd15 = 2_000
    planByLineId.dd15 = planLine("fixed_cost", 2_000, 2)
    plannedSpendByLineId.dd9 = 0
    planByLineId.dd9 = planLine("bonus", 0, 1)
    plannedSpendByLineId.dd10 = 0
    planByLineId.dd10 = planLine("bonus", 0, 1)

    const group = socialGroup({
      key: "digital-display",
      label: "Digital Display",
      lineItemIds,
      plannedSpendByLineId,
      planByLineId,
      spend: 50_000,
      spendEstimated: true,
      impressions: 2_000_000,
    })

    const rate = resolveCpmPlanRate(group)
    assert.equal(rate?.caption, "plan rate")
    assert.equal(rate?.value.toFixed(2), "18.09")

    const cards = buildKpiReview({
      groups: [group],
      lineItemTargets: targets([
        kpi({ mba_number: "BICAU002", line_item_id: "dd1", ctr: 0.01 }),
      ]),
      isAdmin: true,
    })
    const row = cards[0]?.rows.find((item) => item.metric === "cpm")
    assert.equal(row?.targetDisplay, "$18.09")
    assert.equal(row?.targetCaption, "plan rate")
  })

  it("returns null when every line is fixed cost", () => {
    const group = socialGroup({
      lineItemIds: ["dd11", "dd14"],
      plannedSpendByLineId: { dd11: 4_000, dd14: 1_000 },
      planByLineId: {
        dd11: planLine("fixed_cost", 4_000, 1),
        dd14: planLine("fixed_cost", 1_000, 1),
      },
      spend: 5_000,
      spendEstimated: true,
      impressions: 100_000,
    })
    assert.equal(resolveCpmPlanRate(group), null)

    const cards = buildKpiReview({
      groups: [group],
      lineItemTargets: targets([
        kpi({ mba_number: "BICAU002", line_item_id: "dd11", ctr: 0.01 }),
      ]),
      isAdmin: true,
    })
    const row = cards[0]?.rows.find((item) => item.metric === "cpm")
    assert.equal(row?.targetDisplay, "—")
    assert.equal(row?.targetCaption ?? null, null)
    assert.equal(row?.targetSource, null)
    assert.equal(row?.status, "no-data")
    assert.equal(row?.deliveredDisplay, "$50.00")
    assert.equal(row?.spendEstimated, true)
  })

  it("is the ratio of sums, not a spend-weighted average of line rates", () => {
    const group = socialGroup({
      lineItemIds: ["a", "b"],
      plannedSpendByLineId: { a: 1_000, b: 9_000 },
      planByLineId: {
        a: planLine("cpm", 1_000, 100_000),
        b: planLine("cpm", 9_000, 300_000),
      },
    })
    const rate = resolveCpmPlanRate(group)
    assert.equal(rate?.value.toFixed(2), "25.00")
    assert.notEqual(rate?.value.toFixed(2), "28.00")
  })
})
