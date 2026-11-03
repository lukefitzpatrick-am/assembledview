/**
 * B23fix (B23 review finding 1): the P14 package rule in every reader the
 * review listed. A package line has no unit target once
 * `expert_package_quantity` is on: no deliverable goal, expected or planned
 * deliverables, and no target curve. Off: every output is byte-identical.
 */
import assert from "node:assert/strict"
import { describe, it, mock, test } from "node:test"

import { supportsMockModule } from "../../test/mockModuleHarness.js"
import { classifySocialPacingPlatform } from "../../pacing/social/classifySocialPacingPlatform.js"
import { burstsWithoutUnitTarget } from "../packageUnitTarget.js"

const ON = { packageNoUnitTarget: true }
const OFF = { packageNoUnitTarget: false }

if (supportsMockModule()) {
  await mock.module!("@/lib/pacing/social/resolveLiveSocialLineItems", {
    namedExports: { classifySocialPacingPlatform },
  })
}

const START = "2026-10-01"
const END = "2026-10-31"
const AS_AT = "2026-10-15"

function dayRange(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

function burst(calculatedValue: number) {
  return {
    start_date: START,
    end_date: END,
    budget_number: 1000,
    calculated_value_number: calculatedValue,
    calculatedValue,
  }
}

function line(id: string, buyType: string, platform: string, calculatedValue = 3) {
  return { line_item_id: id, platform, buy_type: buyType, totalMedia: 1000, bursts: [burst(calculatedValue)] }
}

function pacingRow(channel: string, lineItemId: string, dateDay: string) {
  return {
    channel,
    dateDay,
    adsetName: null,
    entityName: null,
    campaignId: null,
    campaignName: null,
    adsetId: null,
    entityId: null,
    lineItemId,
    amountSpent: 20,
    impressions: 2000,
    clicks: 20,
    results: 2,
    video3sViews: 0,
    maxFivetranSyncedAt: null,
    updatedAt: null,
  }
}

const rowsFor = (channel: string, id: string) => dayRange(START, "2026-10-14").map((d) => pacingRow(channel, id, d))

describe("burstsWithoutUnitTarget", () => {
  it("off: the same array, untouched", () => {
    const bursts = [burst(3)]
    assert.equal(burstsWithoutUnitTarget(bursts, "package", OFF), bursts)
    assert.equal(burstsWithoutUnitTarget(bursts, "package", undefined), bursts)
    assert.equal(burstsWithoutUnitTarget(bursts, "cpm", ON), bursts)
  })

  it("on: copies with every deliverable field it carries at 0, no keys added, budget kept", () => {
    const bursts = [{ start_date: START, budget_number: 750, deliverables: 3, deliverablesAmount: 3 }]
    const out = burstsWithoutUnitTarget(bursts, " Package ", ON)
    assert.notEqual(out, bursts)
    assert.deepEqual(out, [{ start_date: START, budget_number: 750, deliverables: 0, deliverablesAmount: 0 }])
    assert.equal(bursts[0]!.deliverables, 3, "input not mutated")
  })
})

describe("programmatic compute (client dashboard)", async () => {
  const { buildProgrammaticLineItemMetrics, normalizeProgrammaticLineItems, mapCombinedRowToDv360 } = await import(
    "../programmatic/programmaticCompute.js"
  )
  const kpiTargets = new Map([["dv360|cpm", { ctr: 0.01 }], ["dv360|package", { ctr: 0.01 }]]) as never
  const run = (items: unknown[], options?: { packageNoUnitTarget?: boolean }) =>
    buildProgrammaticLineItemMetrics(
      normalizeProgrammaticLineItems(items),
      [...rowsFor("programmatic-display", "krusty001pd1"), ...rowsFor("programmatic-display", "krusty001pd2")].map(
        (r) => mapCombinedRowToDv360(r as never, new Set(["programmatic-display"])),
      ),
      dayRange(START, END),
      AS_AT,
      "progdisplay",
      kpiTargets,
      { startISO: START, endISO: END },
      START,
      END,
      undefined,
      undefined,
      options,
    )
  const pkg = line("krusty001pd2", "package", "DV360")
  const cpm = line("krusty001pd1", "cpm", "DV360", 100_000)

  it("off and unset are byte-identical; a package quantity is a goal, as before", () => {
    const off = JSON.stringify(run([cpm, pkg], OFF))
    assert.equal(JSON.stringify(run([cpm, pkg])), off)
    assert.equal(JSON.stringify(run([cpm, pkg], {})), off)
    const m = run([pkg], OFF)[0]!
    assert.equal(m.booked.deliverables, 3)
    assert.equal(m.pacing.deliverable?.goalTotal, 3)
  })

  it("on: the package line has no goal, expected or booked deliverables; spend is unchanged", () => {
    const off = run([pkg], OFF)[0]!
    const on = run([pkg], ON)[0]!
    assert.equal(on.booked.deliverables, 0)
    assert.equal(on.pacing.deliverable?.goalTotal ?? 0, 0)
    assert.equal(on.pacing.deliverable?.expectedToDate ?? 0, 0)
    assert.equal(on.shouldToDate.deliverables, 0)
    assert.deepEqual(on.targetCurve, [])
    assert.deepEqual(on.pacing.spend, off.pacing.spend)
    assert.equal(on.booked.spend, off.booked.spend)
    assert.ok(on.bursts.every((b: Record<string, unknown>) => (b.calculated_value_number ?? 0) === 0))
  })

  it("on: a cpm line keeps its goal", () => {
    assert.deepEqual(run([cpm], ON), run([cpm], OFF))
  })
})

describe("social compute (client dashboard)", async () => {
  const { computeSocialLineMetricsForPlatform, normalizeLineItems, mapCombinedRowToMeta } = await import(
    "../social/socialChannelCompute.js"
  )
  const { getPacingWindow } = await import("../../pacing/pacingWindow.js")
  const run = (items: unknown[], packageNoUnitTarget?: boolean) =>
    computeSocialLineMetricsForPlatform({
      activeItems: normalizeLineItems(items as never),
      socialRows: [...rowsFor("meta", "krusty001sm1"), ...rowsFor("meta", "krusty001sm2")].map((r) =>
        mapCombinedRowToMeta(r as never),
      ),
      campaignStart: START,
      campaignEnd: END,
      mbaNumber: "krusty001",
      kpiTargets: undefined,
      filterRange: { start: null, end: null } as never,
      pacingWindow: getPacingWindow(START, END),
      ...(packageNoUnitTarget === undefined ? {} : { packageNoUnitTarget }),
    })
  const pkg = line("krusty001sm2", "package", "Meta")
  const cpm = line("krusty001sm1", "cpm", "Meta", 100_000)

  it("off and unset are byte-identical", () => {
    assert.equal(JSON.stringify(run([cpm, pkg])), JSON.stringify(run([cpm, pkg], false)))
    assert.equal(run([pkg], false)[0]!.booked.deliverables, 3)
  })

  it("on: package goal is none; cpm unchanged", () => {
    const on = run([pkg], true)[0]!
    assert.equal(on.booked.deliverables, 0)
    assert.equal(on.pacing.deliverable?.goalTotal ?? 0, 0)
    assert.equal(on.shouldToDate.deliverables, 0)
    assert.deepEqual(on.pacing.spend, run([pkg], false)[0]!.pacing.spend)
    assert.deepEqual(run([cpm], true), run([cpm], false))
  })
})

describe("channel sections (client dashboard cards)", async () => {
  const { buildProgrammaticChannelSection } = await import(
    "../../../components/dashboard/delivery/channels/programmaticAdapterShared.js"
  )
  const { buildSocialChannelSectionForPlatform } = await import(
    "../../../components/dashboard/delivery/channels/socialAdapterShared.js"
  )
  const prog = (lines: unknown[], packageNoUnitTarget?: boolean) =>
    buildProgrammaticChannelSection({
      key: "programmatic-display",
      title: "Programmatic – Display",
      snowflakeChannel: "programmatic-display",
      mediaCurveKey: "progdisplay",
      curveMetric: "clicks",
      rawLineItems: lines,
      combinedRows: rowsFor("programmatic-display", "krusty001pd2") as never,
      campaignStart: START,
      campaignEnd: END,
      mbaNumber: "krusty001",
      filterRange: { start: null, end: null },
      kpiVersionNumber: 1,
      kpiTargets: undefined,
      lineItemTargets: undefined,
      pacingWindow: { asAtISO: AS_AT, campaignStartISO: START, campaignEndISO: END },
      lastSyncedAt: null,
      pacingAsAtISO: AS_AT,
      ...(packageNoUnitTarget === undefined ? {} : { packageNoUnitTarget }),
    })
  const social = (lines: unknown[], packageNoUnitTarget?: boolean) =>
    buildSocialChannelSectionForPlatform({
      key: "social-meta",
      platform: "meta",
      title: "Meta",
      lineItems: lines as never,
      snowflakeRows: rowsFor("meta", "krusty001sm2") as never,
      campaignStart: START,
      campaignEnd: END,
      mbaNumber: "krusty001",
      kpiVersionNumber: 1,
      kpiTargets: undefined,
      lineItemTargets: undefined,
      filterRange: { start: null, end: null },
      lastSyncedAt: null,
      pacingAsAtISO: AS_AT,
      ...(packageNoUnitTarget === undefined ? {} : { packageNoUnitTarget }),
    })
  const pkgProg = line("krusty001pd2", "package", "DV360")
  const pkgSocial = line("krusty001sm2", "package", "Meta")
  const cpmProg = line("krusty001pd2", "cpm", "DV360")

  for (const [name, build, pkgLine] of [
    ["programmatic", prog, pkgProg],
    ["social", social, pkgSocial],
  ] as const) {
    test(`${name}: off and unset are byte-identical`, () => {
      assert.equal(JSON.stringify(build([pkgLine])), JSON.stringify(build([pkgLine], false)))
    })

    test(`${name}: on, the package card plans no deliverables; spend card unchanged`, () => {
      const off = build([pkgLine], false)!
      const on = build([pkgLine], true)!
      const offJson = JSON.stringify(off)
      const onJson = JSON.stringify(on)
      assert.notEqual(onJson, offJson)
      // The deliverable progress card: no planned or expected units.
      const cards = (s: unknown) =>
        (s as { aggregate?: { progressCards?: Array<Record<string, unknown>> } }).aggregate?.progressCards ?? []
      const offCards = cards(off)
      const onCards = cards(on)
      assert.equal(onCards.length, offCards.length)
      assert.deepEqual(onCards[0], offCards[0], "spend card unchanged")
      assert.notDeepEqual(onCards[1], offCards[1], "deliverable card changed")
      assert.equal(onCards.length, 2)
      // Off reads a package quantity of 3 as the unit goal (thousands of percent).
      assert.equal(offCards[1]!.plannedTotal, 3)
      assert.ok(Number(offCards[1]!.pct) > 1000)
      assert.equal(onCards[1]!.plannedTotal, 0)
      assert.equal(onCards[1]!.expectedToDate, 0)
      // The line block's deliverable card too.
      const lineCards = (s: unknown) =>
        (s as { lineItems?: Array<{ block?: { progressCards?: Array<Record<string, unknown>> } }> }).lineItems?.[0]?.block
          ?.progressCards ?? []
      assert.equal(lineCards(off)[1]!.plannedTotal, 3)
      assert.equal(lineCards(on)[1]!.plannedTotal, 0)
      assert.deepEqual(lineCards(on)[0], lineCards(off)[0])
    })
  }

  test("programmatic: on leaves a cpm line byte-identical", () => {
    assert.equal(JSON.stringify(prog([cpmProg], true)), JSON.stringify(prog([cpmProg], false)))
  })
})

describe("computeLinePace", async () => {
  const { computeLinePace } = await import("../../../components/dashboard/delivery/channels/linePace.js")
  const { resolvePacingWindow } = await import("../../pacing/expectedForWindow.js")
  const window = resolvePacingWindow({ campaignStartISO: START, campaignEndISO: END, asAtISO: AS_AT })
  const base = {
    rawBursts: [{ startDate: START, endDate: END, budget: 1000, calculatedValue: 3 }],
    daily: [{ date: "2026-10-02", spend: 20, deliverable: 2000 }],
    window,
    toDate: window,
    deliverableIsImpressions: false,
  }

  it("unset and false are identical; true plans no deliverables and keeps spend", () => {
    const off = computeLinePace(base)
    assert.deepEqual(computeLinePace({ ...base, noUnitTarget: false }), off)
    assert.ok(off.deliverables.planned > 0)
    const on = computeLinePace({ ...base, noUnitTarget: true })
    assert.deepEqual(on.spend, off.spend)
    assert.equal(on.deliverables.planned, 0)
    assert.equal(on.deliverables.expected, 0)
    assert.equal(on.deliverables.expectedToDate, 0)
    assert.equal(on.deliverables.delivered, off.deliverables.delivered)
  })
})

describe("search (no change needed)", async () => {
  const { buildSearchScheduleByLineItem, buildSearchTargetCurveLineItems } = await import("../search/searchCore.js")
  it("a package search line already has no clicks goal or target curve units, switch or not", () => {
    const items = [
      { ...line("krusty001se1", "package", "Google"), bursts: [{ ...burst(3), deliverables: 3, buy_amount: 2 }] },
      { ...line("krusty001se2", "cpc", "Google"), bursts: [{ ...burst(3), deliverables: 3 }] },
    ]
    const schedule = buildSearchScheduleByLineItem(items)
    assert.deepEqual(
      schedule.get("krusty001se1")!.bursts.map((b) => b.clicksGoal),
      [0],
    )
    assert.deepEqual(
      schedule.get("krusty001se2")!.bursts.map((b) => b.clicksGoal),
      [3],
    )
    const curve = buildSearchTargetCurveLineItems(items, schedule)
    assert.deepEqual(
      curve.map((c) => c.deliverables),
      [0, 3],
    )
  })
})

describe("staff pacing readers", async () => {
  const { buildResolvedKpiRowFromPacing } = await import("../../pacing/kpi/buildResolvedRow.js")
  const { burstsFromLines } = await import("../../pacing/detail/burstsFromLines.js")

  it("search KPI modal row: package plans no deliverables when on", () => {
    const row = {
      clientName: "Krusty Krab",
      mbaNumber: "krusty001",
      mediaPlanVersionNumber: 1,
      campaignName: "Test",
      platform: "google",
      bidStrategy: "",
      lineItemId: "krusty001se1",
      creativeTargeting: "",
      creative: "",
      totalLineItemBudget: 1000,
      bursts: [{ calculatedValue: 3 }],
      buyType: "package",
      kpiTargets: null,
    }
    const off = buildResolvedKpiRowFromPacing(row as never)
    assert.deepEqual(buildResolvedKpiRowFromPacing(row as never, OFF), off)
    assert.equal(off.deliverables, 3)
    const on = buildResolvedKpiRowFromPacing(row as never, ON)
    assert.equal(on.deliverables, 0)
    assert.deepEqual({ ...on, deliverables: 3 }, off)
    assert.equal(buildResolvedKpiRowFromPacing({ ...row, buyType: "cpc" } as never, ON).deliverables, 3)
  })

  it("campaign detail bursts: package planned deliverable is 0 when on", () => {
    const lineModel = {
      lineItemId: "krusty001pd2",
      buyType: "package",
      fixedCost: false,
      spendMode: "actual",
      planBursts: [{ index: 0, start: START, end: END, budget: 1000, calculatedValue: 3 }],
      bursts: { index: 1 },
    }
    const off = burstsFromLines([lineModel as never], AS_AT)
    assert.equal(JSON.stringify(burstsFromLines([lineModel as never], AS_AT, [], OFF)), JSON.stringify(off))
    assert.equal(off[0]!.plannedDeliverable, 3)
    const on = burstsFromLines([lineModel as never], AS_AT, [], ON)
    assert.equal(on[0]!.plannedDeliverable, 0)
    assert.deepEqual({ ...on[0], plannedDeliverable: 3 }, off[0])
  })
})

describe("KPI grouping and resolver (editors, KPI sheet)", async () => {
  const { groupLineItemsForKPI } = await import("../../kpi/grouping.js")
  const { resolveAllKPIs } = await import("../../kpi/resolve.js")
  const items = [
    { line_item_id: "krusty001ooh1", buyType: "package", grossMedia: 1000, bursts: [{ calculatedValue: 4 }] },
    { line_item_id: "krusty001ooh2", buy_type: "cpm", grossMedia: 1000, bursts: [{ calculatedValue: 5000 }] },
  ]

  it("off and unset are identical; on zeroes only the package line", () => {
    const off = groupLineItemsForKPI(items as never, { mediaType: "ooh" })
    assert.deepEqual(groupLineItemsForKPI(items as never, { mediaType: "ooh", ...OFF }), off)
    assert.deepEqual(
      off.map((g) => g.deliverables),
      [4, 5000],
    )
    const on = groupLineItemsForKPI(items as never, { mediaType: "ooh", ...ON })
    assert.deepEqual(
      on.map((g) => g.deliverables),
      [0, 5000],
    )
  })

  it("resolveAllKPIs passes the switch through", () => {
    const args = {
      mediaItemsByType: { ooh: items },
      clientName: "Krusty Krab",
      mbaNumber: "krusty001",
      versionNumber: 1,
      campaignName: "Test",
      publisherKPIs: [],
      clientKPIs: [],
      savedCampaignKPIs: [],
    }
    const off = resolveAllKPIs(args as never)
    assert.deepEqual(resolveAllKPIs({ ...args, packageNoUnitTarget: false } as never), off)
    const on = resolveAllKPIs({ ...args, packageNoUnitTarget: true } as never)
    assert.equal(on.find((r) => r.lineItemId === "krusty001ooh1")?.deliverables, 0)
    assert.equal(off.find((r) => r.lineItemId === "krusty001ooh1")?.deliverables, 4)
  })
})
