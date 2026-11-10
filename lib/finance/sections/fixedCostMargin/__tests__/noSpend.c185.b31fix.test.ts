/**
 * B31fix C-185: a platform-cost line's month with billing and no spend
 * recorded no longer counts as 100% margin, behind
 * `fixed_cost_margin_no_spend_yet` (default off).
 *
 * - Before the current Melbourne month: "Billed, no spend recorded", margin
 *   blank, out of margin totals and margin %.
 * - After it: out of margin the same way ("Future month, no spend yet").
 * - The current month: as today (margin = billed less spend to date).
 * - Off (no `noSpendYet` input): byte-identical to today.
 *
 * Live-shaped: sinch001po1 (Broadsign, Vistar spend), billing and spend read
 * on 10 Nov 2026. July is billed $952.38; Vistar spend starts in August.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { featureDefinition, type FeatureKey } from "@/lib/features/registry"

import {
  composeFixedCostMargin,
  lineFlagLabels,
  monthNoSpendLabel,
  summariseFixedCostMargin,
  totalsForLines,
  type FixedCostMarginLine,
  type FixedCostPlanCell,
  type LineBillCostCell,
  type PlatformSpendCell,
} from "../compose.js"
import { buildFixedCostMarginWorkbookBytes } from "../excel.js"
import { NO_SPEND_FUTURE_LABEL, NO_SPEND_RECORDED_LABEL, NO_SPEND_YET_NOTE, noSpendYetFor } from "../noSpend.js"
import { readFixedCostMarginNoSpendYet } from "../noSpend.server.js"
import { BOSS_FROM, BOSS_RANGE, bossPlan, bossPreDateSpend, bossSpend } from "./fixtures/bossFc9.js"
import { seededInts } from "./fixtures/prng.js"

const RANGE = { from: "2026-07", to: "2026-11" } as const
const NOW = { currentMonth: "2026-11" }

const SINCH_BILLED: Record<string, number> = {
  "2026-07": 95238,
  "2026-08": 738095,
  "2026-09": 714286,
  "2026-10": 738095,
  "2026-11": 714286,
}
const SINCH_SPEND: Record<string, number> = { "2026-08": 611245, "2026-09": 345545, "2026-10": 342288, "2026-11": 84666 }

function sinchPlan(extra: Record<string, number> = {}): FixedCostPlanCell[] {
  const base = bossPlan()[0]!
  return Object.entries({ ...SINCH_BILLED, ...extra }).map(([month, amountCents]) => ({
    ...base,
    clientId: 31,
    clientName: "Sinch",
    mbaNumber: "sinch001",
    campaignName: "sinch001",
    lineItemId: "sinch001po1",
    publisher: "Broadsign",
    platform: "Vistar",
    channel: "prog_ooh",
    month,
    amountCents,
    costBasis: "platform",
  }))
}

function sinchSpend(): PlatformSpendCell[] {
  return Object.entries(SINCH_SPEND).map(([month, spendCents]) => ({
    lineItemId: "sinch001po1",
    month,
    source: "Vistar",
    spendCents,
    impressions: 1000,
    rowCount: 20,
  }))
}

function compose(opts: { noSpendYet?: { currentMonth: string } | null; extra?: Record<string, number>; range?: { from: string; to: string } } = {}) {
  return composeFixedCostMargin({
    plan: sinchPlan(opts.extra),
    spend: sinchSpend(),
    invoiced: new Set(),
    ...(opts.range ?? RANGE),
    ...(opts.noSpendYet === undefined ? {} : { noSpendYet: opts.noSpendYet }),
  })
}

const month = (lines: FixedCostMarginLine[], m: string) => lines[0]!.months.find((x) => x.month === m)!

// ---------------------------------------------------------------------------
// The switch
// ---------------------------------------------------------------------------

test("registry: finance, default off, admin, page switch, no env var", () => {
  const def = featureDefinition("fixed_cost_margin_no_spend_yet")!
  assert.ok(def)
  assert.equal(def.area, "finance")
  assert.equal(def.defaultOn, false)
  assert.equal(def.toggleRole, "admin")
  assert.equal(def.source, "switch")
  assert.equal(def.clientVisible, false)
  assert.equal(def.envName, undefined)
  assert.equal(def.requires, undefined)
  assert.match(def.description, /Billed, no spend recorded/)
  assert.match(def.description, /The current month keeps today's rule/)
  assert.match(def.description, /Billing, true-up, accruals and Xero never read it/)
  assert.match(def.description, /Off: the report is exactly as before/)
})

test("server read: on only when the switch reads true; a failed read is off", async () => {
  for (const v of [false, true]) {
    const seen: FeatureKey[] = []
    const on = await readFixedCostMarginNoSpendYet(async (key) => {
      seen.push(key)
      return v
    })
    assert.equal(on, v)
    assert.deepEqual(seen, ["fixed_cost_margin_no_spend_yet"])
  }
  const warn = console.warn
  console.warn = () => {}
  try {
    assert.equal(
      await readFixedCostMarginNoSpendYet(async () => {
        throw new Error("db down")
      }),
      false,
    )
  } finally {
    console.warn = warn
  }
})

test("rule: past, future, and the current month keeps today's rule", () => {
  assert.equal(noSpendYetFor("2026-07", "2026-11"), "past")
  assert.equal(noSpendYetFor("2026-12", "2026-11"), "future")
  assert.equal(noSpendYetFor("2026-11", "2026-11"), null)
  assert.equal(monthNoSpendLabel({ noSpendYet: "past" }), NO_SPEND_RECORDED_LABEL)
  assert.equal(monthNoSpendLabel({ noSpendYet: "future" }), NO_SPEND_FUTURE_LABEL)
  assert.equal(monthNoSpendLabel({}), null)
})

// ---------------------------------------------------------------------------
// Off: exactly as today
// ---------------------------------------------------------------------------

test("off: no input or null gives today's payload byte for byte; July is 100% margin", () => {
  const plain = compose()
  assert.equal(JSON.stringify(compose({ noSpendYet: null })), JSON.stringify(plain))
  assert.doesNotMatch(JSON.stringify(plain), /noSpendYet/)
  const jul = month(plain, "2026-07")
  assert.equal(jul.marginCents, 95238)
  assert.equal(jul.marginPct, 1)
})

// ---------------------------------------------------------------------------
// On
// ---------------------------------------------------------------------------

test("on: sinch001po1 July (past, billed, no spend) has no margin and leaves the margin totals", () => {
  const off = compose()
  const on = compose({ noSpendYet: NOW })
  const jul = month(on, "2026-07")
  assert.equal(jul.noSpendYet, "past")
  assert.equal(jul.marginCents, null)
  assert.equal(jul.marginPct, null)
  assert.equal(jul.billedCents, 95238)
  assert.equal(jul.actualCents, 0)
  // Every other month is unchanged.
  for (const m of ["2026-08", "2026-09", "2026-10", "2026-11"]) {
    assert.deepEqual(month(on, m), month(off, m), m)
  }
  const tOff = summariseFixedCostMargin(off).grand
  const tOn = summariseFixedCostMargin(on).grand
  assert.equal(tOn.billedCents, tOff.billedCents)
  assert.equal(tOn.actualCents, tOff.actualCents)
  assert.equal(tOff.marginCents - tOn.marginCents, 95238)
  assert.equal(tOff.billedWithCostCents - tOn.billedWithCostCents, 95238)
  assert.equal(tOn.billedWithoutCostCents - tOff.billedWithoutCostCents, 95238)
  assert.equal(tOn.marginPct, tOn.marginCents / tOn.billedWithCostCents)
  const julTotals = totalsForLines(on, "2026-07")
  assert.equal(julTotals.marginCents, 0)
  assert.equal(julTotals.marginPct, null)
  assert.equal(julTotals.billedWithoutCostCents, 95238)
})

test("on: the current month keeps today's rule, even with no spend yet", () => {
  // July is the current month: spend still arriving, so it still counts.
  const on = compose({ noSpendYet: { currentMonth: "2026-07" } })
  const jul = month(on, "2026-07")
  assert.equal("noSpendYet" in jul, false)
  assert.equal(jul.marginCents, 95238)
})

test("on: a future month with billing and no spend is out of margin", () => {
  const range = { from: "2026-07", to: "2027-01" }
  const extra = { "2026-12": 500000, "2027-01": 400000 }
  const off = compose({ extra, range })
  const on = compose({ extra, range, noSpendYet: NOW })
  for (const m of ["2026-12", "2027-01"]) {
    assert.equal(month(off, m).marginCents, month(off, m).billedCents)
    assert.equal(month(on, m).noSpendYet, "future", m)
    assert.equal(month(on, m).marginCents, null, m)
  }
  assert.equal(summariseFixedCostMargin(off).grand.marginCents - summariseFixedCostMargin(on).grand.marginCents, 95238 + 900000)
})

test("on: spend rows with 0 spend are spend recorded, not tagged; a line with no spend at all is not tagged", () => {
  const zeroRow: PlatformSpendCell = { lineItemId: "sinch001po1", month: "2026-07", source: "Vistar", spendCents: 0, impressions: 0, rowCount: 3 }
  const [line] = composeFixedCostMargin({ plan: sinchPlan(), spend: [...sinchSpend(), zeroRow], invoiced: new Set(), ...RANGE, noSpendYet: NOW })
  assert.equal("noSpendYet" in month([line!], "2026-07"), false)
  assert.equal(month([line!], "2026-07").marginCents, 95238)
  const [none] = composeFixedCostMargin({ plan: sinchPlan(), spend: [], invoiced: new Set(), ...RANGE, noSpendYet: NOW })
  assert.equal(none!.costStatus, "none")
  assert.ok(none!.months.every((m) => !("noSpendYet" in m) && m.marginCents == null))
})

test("on: bill-cost lines are not touched (they already leave a month with no bill out)", () => {
  const plan = sinchPlan().map((c) => ({ ...c, publisher: "Channel Factory", costBasis: "xero_bill" as const }))
  const bill: LineBillCostCell = {
    lineItemId: "sinch001po1",
    month: "2026-08",
    basis: "billed",
    countedGrossCents: 500000,
    countedRebateCents: 0,
    countedNetCents: 500000,
    pendingNetCents: 0,
    methods: ["cf_placement"],
    statuses: ["PAID"],
    supplierKinds: ["channel_factory"],
  }
  const off = composeFixedCostMargin({ plan, spend: [], invoiced: new Set(), ...RANGE, billCosts: [bill] })
  const on = composeFixedCostMargin({ plan, spend: [], invoiced: new Set(), ...RANGE, billCosts: [bill], noSpendYet: NOW })
  assert.equal(JSON.stringify(on), JSON.stringify(off))
})

test("on: a negative billing month (credit) with no spend in the past is out of margin too", () => {
  const on = compose({ noSpendYet: NOW, extra: { "2026-07": -20000 } })
  assert.equal(month(on, "2026-07").noSpendYet, "past")
  assert.equal(month(on, "2026-07").marginCents, null)
})

test("on: BOSS fixture (spend in every billed month) is unchanged", () => {
  const off = composeFixedCostMargin({ plan: bossPlan(), spend: bossSpend(), invoiced: new Set(), ...BOSS_RANGE })
  const on = composeFixedCostMargin({ plan: bossPlan(), spend: bossSpend(), invoiced: new Set(), ...BOSS_RANGE, noSpendYet: NOW })
  assert.equal(JSON.stringify(on), JSON.stringify(off))
  assert.equal(summariseFixedCostMargin(on).grand.marginCents, 484399)
})

// ---------------------------------------------------------------------------
// With FC9 (the from date): the legs still add up and FC9 still moves no total
// ---------------------------------------------------------------------------

test("with FC9: a tagged month's legs carry no margin; FC9 on equals FC9 off with C-185 on (random plans)", (t) => {
  // B31fix2 M1: a seeded mulberry32 (fixtures/prng.ts). The old LCG's high
  // bits were spread here, but its doubles rounded; one generator for all.
  const r = seededInts(1185)
  const rnd = (n: number) => r.int(n)
  let split = 0
  let taggedSplit = 0
  let planCells = 0
  const strip = (lines: readonly FixedCostMarginLine[]) =>
    JSON.parse(JSON.stringify(lines, (k, v) => (k === "fixedCostFrom" || k === "legs" || k === "fixedCostLegs" ? undefined : v)))
  const months = ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]
  let tagged = 0
  for (let run = 0; run < 200; run += 1) {
    const from = `2026-${["09", "10", "11"][rnd(3)]}-${String(1 + rnd(28)).padStart(2, "0")}`
    const plan: FixedCostPlanCell[] = []
    const spend: PlatformSpendCell[] = []
    const pre = new Map<string, number>()
    for (let l = 0; l < 3; l += 1) {
      const id = `RND${run}PD${l}`
      for (const m of months) {
        if (rnd(4)) plan.push({ ...bossPlan()[0]!, mbaNumber: `RND${run}`, lineItemId: id, month: m, amountCents: rnd(300000) - 20000, fixedCostFrom: from })
        if (rnd(2)) spend.push({ lineItemId: id.toLowerCase(), month: m, source: "Taboola", spendCents: rnd(400000), impressions: 1, rowCount: 1 + rnd(3) })
      }
      if (rnd(5)) pre.set(id.toLowerCase(), rnd(450000))
    }
    planCells += plan.length
    const range = { from: "2026-08", to: "2026-12" }
    const noSpendYet = { currentMonth: "2026-10" }
    const on = composeFixedCostMargin({ plan, spend, invoiced: new Set(), ...range, preDateSpendCents: pre, noSpendYet })
    const off = composeFixedCostMargin({ plan: plan.map(({ fixedCostFrom: _d, ...c }) => c), spend, invoiced: new Set(), ...range, noSpendYet })
    assert.deepEqual(strip(on), strip(off), `run ${run}`)
    assert.deepEqual(summariseFixedCostMargin(on), summariseFixedCostMargin(off), `run ${run}`)
    for (const line of on) {
      for (const m of line.months) {
        if (m.legs?.kind === "split") split += 1
        if (!m.noSpendYet) continue
        tagged += 1
        if (m.legs?.kind === "split") taggedSplit += 1
        assert.equal(m.marginCents, null)
        if (m.legs?.kind === "split") {
          assert.equal(m.legs.before.marginCents, null)
          assert.equal(m.legs.from.marginCents, null)
        }
      }
      if (line.fixedCostLegs) {
        const m = (line.fixedCostLegs.before.marginCents ?? 0) + (line.fixedCostLegs.from.marginCents ?? 0)
        assert.equal(m, line.totals.marginCents, `run ${run} ${line.lineItemId}`)
      }
    }
  }
  t.diagnostic(JSON.stringify({ planCells, split, tagged, taggedSplit }))
  assert.ok(tagged > 50, `tagged months exercised: ${tagged}`)
  // Coverage guard (B31fix2 M1): plans are built, date months split, and some split months are tagged.
  assert.ok(planCells >= 1500, `plan cells: ${planCells}`)
  assert.ok(split >= 150, `split months: ${split}`)
  assert.ok(taggedSplit >= 10, `tagged split months: ${taggedSplit}`)
})

test("with FC9 on BOSS: C-185 on and FC9 on keeps every B31 total", () => {
  const off = composeFixedCostMargin({ plan: bossPlan(), spend: bossSpend(), invoiced: new Set(), ...BOSS_RANGE, noSpendYet: NOW })
  const on = composeFixedCostMargin({
    plan: bossPlan(BOSS_FROM),
    spend: bossSpend(),
    invoiced: new Set(),
    ...BOSS_RANGE,
    preDateSpendCents: bossPreDateSpend(),
    noSpendYet: NOW,
  })
  assert.deepEqual(summariseFixedCostMargin(on), summariseFixedCostMargin(off))
  assert.equal(summariseFixedCostMargin(on).grand.marginCents, 484399)
})

// ---------------------------------------------------------------------------
// Excel and notes
// ---------------------------------------------------------------------------

test("Excel: the flags column tags the month; off, the workbook is unchanged", async () => {
  const ExcelJS = (await import("exceljs")).default
  async function sheets(lines: FixedCostMarginLine[]) {
    const bytes = await buildFixedCostMarginWorkbookBytes(lines, summariseFixedCostMargin(lines), ["n"])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(bytes)
    const out: Record<string, unknown[][]> = {}
    for (const ws of wb.worksheets) {
      const rows: unknown[][] = []
      ws.eachRow({ includeEmpty: true }, (r) => rows.push(JSON.parse(JSON.stringify(r.values))))
      out[ws.name] = rows
    }
    return out
  }
  assert.deepEqual(await sheets(compose({ noSpendYet: null })), await sheets(compose()))
  const on = await sheets(compose({ noSpendYet: NOW }))
  const header = on["Line months"]![0] as unknown[]
  const flagsCol = header.indexOf("Flags")
  const marginCol = header.indexOf("Margin $")
  const jul = on["Line months"]!.find((r) => r[header.indexOf("Month")] === "2026-07")!
  assert.equal(jul[flagsCol], NO_SPEND_RECORDED_LABEL)
  assert.equal(jul[marginCol] ?? null, null)
  assert.ok(!lineFlagLabels(compose({ noSpendYet: NOW })[0]!).includes(NO_SPEND_RECORDED_LABEL), "a month tag, not a line flag")
  assert.match(NO_SPEND_YET_NOTE, /current month is month to date/)
})
