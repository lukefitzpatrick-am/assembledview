import assert from "node:assert/strict"
import test from "node:test"

import type { DeliveryChannelGroup, DeliveryLineSnapshot } from "@/lib/ava/tools/summaries"
import { buildDeckDetail, type DeckDetailSnapshot } from "@/lib/reports/campaignReport/deckDetail"

const WINDOW = { startISO: "2026-07-01", endISO: "2026-10-19" }

function line(partial: Partial<DeliveryLineSnapshot> & Pick<DeliveryLineSnapshot, "lineItemId" | "name">): DeliveryLineSnapshot {
  return {
    plannedBudget: 1000,
    plannedUnits: null,
    startDate: "2026-07-01",
    endDate: "2026-12-31",
    spendToDate: 0,
    impressions: 0,
    clicks: 0,
    results: 0,
    video3sViews: 0,
    cpm: null,
    ctr: null,
    cpc: null,
    noDeliveryRows: false,
    deliveryState: "reported",
    ...partial,
  }
}

function channel(
  group: string,
  lines: DeliveryLineSnapshot[],
  spend = lines.reduce((sum, item) => sum + item.spendToDate, 0),
): DeliveryChannelGroup {
  return {
    group,
    lines,
    totals: {
      spendToDate: spend,
      impressions: lines.reduce((sum, item) => sum + item.impressions, 0),
      clicks: lines.reduce((sum, item) => sum + item.clicks, 0),
      results: lines.reduce((sum, item) => sum + item.results, 0),
      video3sViews: 0,
      plannedBudget: 1000,
      cpm: null,
      ctr: null,
      cpc: null,
    },
  }
}

function cents(value: number): number {
  return Math.round(value * 100)
}

test("line_item uses the plan label, not the line id", () => {
  const snapshot: DeckDetailSnapshot = {
    channels: [
      channel("social_meta", [
        line({
          lineItemId: "curatif004sm1",
          name: "curatif004sm1",
          label: "Meta • Engaged & Prospecting Audiences",
          spendToDate: 24689.97,
          impressions: 1000,
          clicks: 50,
          results: 12,
        }),
      ]),
    ],
  }
  const [detail] = buildDeckDetail(snapshot, "line_item", WINDOW)
  assert.equal(detail?.rows.length, 1)
  assert.equal(detail?.rows[0]?.name, "Meta • Engaged & Prospecting Audiences")
  assert.equal(detail?.rows[0]?.name.includes("curatif004sm1"), false)
  assert.equal(detail?.rows[0]?.spend, 24689.97)
})

test("Meta ad sets strip the line-id suffix and merge 7 ids into 4 names", () => {
  const names: Array<[string, number, string]> = [
    ["Prospecting-AU-ADV+-curatif004SM1", 100, "id-1"],
    ["prospecting-au-adv+-curatif004sm1", 50, "id-2"],
    ["Prospecting-AU-ADV+-curatif004SM1", 25, "id-3"],
    ["Retargeting-AU-ADV+-curatif004SM1", 80, "id-4"],
    ["Consideration-AU-ADV+-curatif004SM1", 40, "id-5"],
    ["Awareness-AU-ADV+-curatif004SM1", 30, "id-6"],
    ["awareness-au-adv+-curatif004SM1", 10, "id-7"],
  ]
  const spend = names.reduce((sum, row) => sum + row[1], 0)
  const snapshot: DeckDetailSnapshot = {
    channels: [
      channel("social_meta", [
        line({ lineItemId: "curatif004sm1", name: "curatif004sm1", spendToDate: spend, impressions: 100, clicks: 10, results: 4 }),
      ]),
    ],
    dailyPacingRows: [
      ...names.map(([entityName, amountSpent, entityId]) => ({
        dateDay: "2026-08-01",
        entityName,
        entityId,
        lineItemId: "curatif004SM1",
        amountSpent,
        impressions: amountSpent,
        clicks: 1,
        results: 1,
      })),
      {
        dateDay: "2026-10-20",
        entityName: "Outside-AU-ADV+-curatif004SM1",
        lineItemId: "curatif004SM1",
        amountSpent: 999,
        impressions: 999,
        clicks: 9,
        results: 9,
      },
    ],
  }
  const [detail] = buildDeckDetail(snapshot, "ad_group", WINDOW)
  assert.equal(detail?.total, 4)
  assert.equal(detail?.rows.length, 4)
  assert.deepEqual(
    detail?.rows.map((row) => row.name),
    ["Prospecting-AU-ADV+", "Retargeting-AU-ADV+", "Awareness-AU-ADV+", "Consideration-AU-ADV+"],
  )
  assert.equal(detail?.rows.every((row) => /curatif004/i.test(row.name)), false)
  assert.equal(detail?.rows[0]?.spend, 175)
})

test("Search case-split ad group names merge", () => {
  const snapshot: DeckDetailSnapshot = {
    channels: [
      channel("search", [
        line({ lineItemId: "curatif004se1", name: "curatif004se1", spendToDate: 17.75, impressions: 300, clicks: 30, results: 3 }),
      ]),
    ],
    dailySearch: {
      adGroups: [
        { lineItemId: "curatif004se1", name: "top products-curatif004se1", totals: { cost: 10.5, impressions: 200, clicks: 20, conversions: 2 } },
        { lineItemId: "curatif004SE1", name: "Top products-curatif004SE1", totals: { cost: 4.25, impressions: 80, clicks: 8, conversions: 1 } },
        { lineItemId: "curatif004se1", name: "pure brand-curatif004se1", totals: { cost: 3, impressions: 20, clicks: 2, conversions: 0 } },
      ],
    },
  }
  const [detail] = buildDeckDetail(snapshot, "ad_group", WINDOW)
  assert.equal(detail?.total, 2)
  const merged = detail?.rows.find((row) => row.name.toLowerCase() === "top products")
  assert.equal(merged?.name, "top products")
  assert.equal(merged?.spend, 14.75)
})

test("CM360 placements have no spend, rank by impressions, and carry the placement note", () => {
  const snapshot: DeckDetailSnapshot = {
    channels: [
      channel("digital_display", [
        line({
          lineItemId: "golf025dd3",
          name: "golf025dd3",
          spendToDate: 6077.46,
          spendMode: "estimated",
          impressions: 300000,
          clicks: 100,
        }),
        line({
          lineItemId: "golf025dv2",
          name: "golf025dv2",
          spendToDate: 100,
          impressions: 90000,
          clicks: 10,
        }),
      ]),
    ],
    dailyPacingRows: [
      {
        dateDay: "2026-09-01",
        entityName: "golf_australia-australian_open_fy27-kayo-bvod-1920x1080--ausopen_hype_30sec",
        lineItemId: "golf025dv2",
        amountSpent: 0,
        impressions: 94401,
        clicks: 10,
        results: 0,
      },
      {
        dateDay: "2026-09-02",
        entityName: "golf_australia-australian_open_fy27-NewsCorp-Video-golf025DD3",
        lineItemId: "golf025dd3",
        amountSpent: 12,
        impressions: 249317,
        clicks: 40,
        results: 0,
      },
    ],
  }
  const [detail] = buildDeckDetail(snapshot, "ad_group", WINDOW)
  assert.equal(detail?.rankBy, "impressions")
  assert.equal(detail?.rows[0]?.spend, null)
  assert.equal(detail?.rows[1]?.spend, null)
  assert.equal(detail?.rows[0]?.impressions, 249317)
  assert.equal(detail?.rows[0]?.name.startsWith("golf_australia"), false)
  assert.equal(/golf025/i.test(detail?.rows[0]?.name ?? ""), false)
  assert.equal(detail?.note, "Placements ranked by impressions. Spend is reported at line level.")
  assert.equal(detail?.rows[0]?.results, null)
})

test("the top 6 cut adds the Top 6 of N note", () => {
  const lines = [70, 60, 50, 40, 30, 20, 10].map((spend, index) =>
    line({
      lineItemId: `golf025dd${index + 1}`,
      name: `golf025dd${index + 1}`,
      label: `News Corp • Placement ${spend}`,
      spendToDate: spend,
      spendMode: "estimated",
      impressions: spend,
      clicks: 1,
    }),
  )
  const snapshot: DeckDetailSnapshot = {
    channels: [channel("digital_display", lines)],
  }
  const [detail] = buildDeckDetail(snapshot, "line_item", WINDOW)
  assert.equal(detail?.total, 7)
  assert.equal(detail?.rows.length, 6)
  assert.equal(detail?.rows[0]?.spend, 70)
  assert.equal(detail?.rows.some((row) => row.name.includes("10")), false)
  assert.equal(
    detail?.note,
    "Estimated spend on CM360 lines. Top 6 of 7 by spend.",
  )
})

test("Meta and Search ad-group spend reconciles to the channel spend", () => {
  const metaParts: Array<[string, number, string]> = [
    ["Prospecting-AU-ADV+-curatif004SM1", 100.1, "id-1"],
    ["prospecting-au-adv+-curatif004sm1", 50.2, "id-2"],
    ["Prospecting-AU-ADV+-curatif004SM1", 25.3, "id-3"],
    ["Retargeting-AU-ADV+-curatif004SM1", 80.4, "id-4"],
    ["Consideration-AU-ADV+-curatif004SM1", 40.05, "id-5"],
    ["Awareness-AU-ADV+-curatif004SM1", 30.15, "id-6"],
    ["awareness-au-adv+-curatif004SM1", 10.25, "id-7"],
  ]
  const metaSpend = metaParts.reduce((sum, row) => sum + row[1], 0)
  const searchParts = [
    { name: "top products-curatif004se1", cost: 10.11 },
    { name: "Top products-curatif004SE1", cost: 4.22 },
    { name: "pure brand-curatif004se1", cost: 3.33 },
  ]
  const searchSpend = searchParts.reduce((sum, row) => sum + row.cost, 0)
  const snapshot: DeckDetailSnapshot = {
    channels: [
      channel("social_meta", [
        line({ lineItemId: "curatif004sm1", name: "curatif004sm1", spendToDate: metaSpend, impressions: 10, clicks: 1, results: 1 }),
      ]),
      channel("search", [
        line({ lineItemId: "curatif004se1", name: "curatif004se1", spendToDate: searchSpend, impressions: 10, clicks: 1, results: 1 }),
      ]),
    ],
    dailyPacingRows: metaParts.map(([entityName, amountSpent]) => ({
      dateDay: "2026-08-15",
      entityName,
      lineItemId: "curatif004sm1",
      amountSpent,
      impressions: 10,
      clicks: 1,
      results: 1,
    })),
    dailySearch: {
      adGroups: searchParts.map((row) => ({
        lineItemId: "curatif004se1",
        name: row.name,
        totals: { cost: row.cost, impressions: 10, clicks: 1, conversions: 1 },
      })),
    },
  }
  const details = buildDeckDetail(snapshot, "ad_group", WINDOW)
  for (const group of ["social_meta", "search"] as const) {
    const detail = details.find((entry) => entry.group === group)
    const channelSpend = snapshot.channels.find((entry) => entry.group === group)?.totals.spendToDate ?? 0
    const summed = (detail?.rows ?? []).reduce((sum, row) => sum + (row.spend ?? 0), 0)
    assert.equal(detail?.total, detail?.rows.length)
    assert.equal(cents(summed), cents(channelSpend))
  }
})

test("an all-zero CM360 placement is dropped, and total drops by one", () => {
  const snapshot: DeckDetailSnapshot = {
    channels: [
      channel("digital_display", [
        line({
          lineItemId: "golf025dd3",
          name: "golf025dd3",
          spendToDate: 6077.46,
          spendMode: "estimated",
          impressions: 300000,
          clicks: 40,
        }),
      ]),
    ],
    dailyPacingRows: [
      {
        dateDay: "2026-09-01",
        entityName: "NewsCorp-Video-golf025DD3",
        lineItemId: "golf025dd3",
        amountSpent: 0,
        impressions: 249317,
        clicks: 40,
        results: 0,
      },
      {
        dateDay: "2026-09-02",
        entityName: "Kayak-Video-golf025DD3",
        lineItemId: "golf025dd3",
        amountSpent: 0,
        impressions: 100,
        clicks: 1,
        results: 0,
      },
      {
        dateDay: "2026-09-03",
        entityName: "Scrollx--ausopen",
        lineItemId: "golf025dd3",
        amountSpent: 0,
        impressions: 0,
        clicks: 0,
        results: 0,
      },
    ],
  }
  const [detail] = buildDeckDetail(snapshot, "ad_group", WINDOW)
  assert.equal(detail?.total, 2)
  assert.equal(detail?.rows.length, 2)
  assert.equal(detail?.rows.some((row) => row.name === "Scrollx--ausopen"), false)
})

test("two lines with the same label get (SM1) and (SM2)", () => {
  const label = "Meta • Avid Golfers — Handicap custom audiences"
  const snapshot: DeckDetailSnapshot = {
    channels: [
      channel("social_meta", [
        line({
          lineItemId: "golf025sm1",
          name: "golf025sm1",
          label,
          spendToDate: 27943.45,
          impressions: 100,
          clicks: 10,
        }),
        line({
          lineItemId: "golf025sm2",
          name: "golf025sm2",
          label,
          spendToDate: 5914.58,
          impressions: 40,
          clicks: 4,
        }),
      ]),
    ],
  }
  const [detail] = buildDeckDetail(snapshot, "line_item", WINDOW)
  assert.deepEqual(
    detail?.rows.map((row) => row.name),
    [`${label} (SM1)`, `${label} (SM2)`],
  )
})

test("VIC-ADV+-golf012SM1 becomes VIC-ADV+", () => {
  const snapshot: DeckDetailSnapshot = {
    channels: [
      channel("social_meta", [
        line({
          lineItemId: "golf025sm2",
          name: "golf025sm2",
          spendToDate: 13658.89,
          impressions: 100,
          clicks: 10,
        }),
      ]),
    ],
    dailyPacingRows: [
      {
        dateDay: "2026-08-01",
        entityName: "VIC-ADV+-golf012SM1",
        lineItemId: "golf025sm2",
        amountSpent: 13658.89,
        impressions: 100,
        clicks: 10,
        results: 1,
      },
    ],
  }
  const [detail] = buildDeckDetail(snapshot, "ad_group", WINDOW)
  assert.equal(detail?.rows[0]?.name, "VIC-ADV+")
  assert.equal(detail?.rows[0]?.name.includes("golf012"), false)
})

test("a half-cent line spend rounds half-up to the cent", () => {
  const snapshot: DeckDetailSnapshot = {
    channels: [
      channel("social_meta", [
        line({
          lineItemId: "planSM1",
          name: "planSM1",
          label: "Prospecting",
          spendToDate: 2.135,
          impressions: 1,
        }),
      ]),
    ],
  }
  const [detail] = buildDeckDetail(snapshot, "line_item", WINDOW)
  assert.equal(detail?.rows[0]?.spend, 2.14)
})

test("not-live and assumed-spend channels are left out", () => {
  const snapshot: DeckDetailSnapshot = {
    channels: [
      channel("social_tiktok", [
        line({ lineItemId: "curatif004sm2", name: "curatif004sm2", impressions: 50, clicks: 1 }),
      ], 0),
      channel("assumed_spend", [
        line({ lineItemId: "golf025ra1", name: "golf025ra1", spendToDate: 1200, spendMode: "assumed", deliveryState: "assumed" }),
      ]),
      channel("plan_only", [
        line({ lineItemId: "golf025xx1", name: "golf025xx1", spendToDate: 400 }),
      ]),
      channel("social_meta", [
        line({ lineItemId: "curatif004sm1", name: "curatif004sm1", label: "Meta • Prospecting", spendToDate: 10, impressions: 5, clicks: 1 }),
      ]),
    ],
  }
  const details = buildDeckDetail(snapshot, "line_item", WINDOW)
  assert.deepEqual(details.map((entry) => entry.group), ["social_meta"])
})
