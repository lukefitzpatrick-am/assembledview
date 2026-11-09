/**
 * B31 FC9 (C2): a dated platform-cost line's months are a before-the-date leg
 * (actual) or a fixed cost leg; the date's month splits by the FC6 rule.
 *
 * Pinned: every leg pair adds to its month exactly, a line's leg totals add
 * to its totals, and every line, month and report total equals the switch-off
 * output (no date) on the live-shaped BOSS010/BOSS011 fixture and on random
 * integer-cent months.
 */
import assert from "node:assert/strict"
import test from "node:test"

import {
  composeFixedCostMargin,
  FIXED_COST_FROM_UNSPLIT_NOTE,
  lineFlagLabels,
  summariseFixedCostMargin,
  totalsForLines,
  type FixedCostMarginLine,
  type FixedCostPlanCell,
  type LineBillCostCell,
} from "../compose.js"
import { buildFixedCostMarginWorkbookBytes } from "../excel.js"
import {
  lineLegTotals,
  monthAgainstDate,
  monthLegLabel,
  monthLegs,
  splitDateMonth,
  type FixedCostLegAmounts,
} from "../fromDate.js"
import { preDateSpendSql, preDateWindows } from "../query.js"
import {
  BOSS_FROM,
  BOSS_LINES,
  BOSS_RANGE,
  BOSS_TODAY_MARGIN_CENTS,
  bossPlan,
  bossPreDateSpend,
  bossSpend,
} from "./fixtures/bossFc9.js"

function bossLines(opts: { from?: string; pre?: Map<string, number> | null } = {}): FixedCostMarginLine[] {
  return composeFixedCostMargin({
    plan: bossPlan(opts.from),
    spend: bossSpend(),
    invoiced: new Set(),
    ...BOSS_RANGE,
    ...(opts.pre === undefined ? {} : { preDateSpendCents: opts.pre }),
  })
}

/** Lines minus every FC9 key, to compare with the switch-off output. */
function withoutFc9(lines: readonly FixedCostMarginLine[]): unknown {
  return JSON.parse(
    JSON.stringify(lines, (key, value) =>
      key === "fixedCostFrom" || key === "legs" || key === "fixedCostLegs" ? undefined : value,
    ),
  )
}

const sum = (a: FixedCostLegAmounts, b: FixedCostLegAmounts) => ({
  billedCents: a.billedCents + b.billedCents,
  actualCents: a.actualCents + b.actualCents,
  marginCents: a.marginCents == null && b.marginCents == null ? null : (a.marginCents ?? 0) + (b.marginCents ?? 0),
})

/** Every month's legs add to the month; every line's leg totals add to the line. */
function assertLegsAddUp(lines: readonly FixedCostMarginLine[]): void {
  for (const line of lines) {
    for (const m of line.months) {
      if (m.legs?.kind !== "split") continue
      assert.deepEqual(
        sum(m.legs.before, m.legs.from),
        { billedCents: m.billedCents, actualCents: m.actualCents, marginCents: m.marginCents },
        `${line.lineItemId} ${m.month}`,
      )
    }
    if (line.fixedCostLegs) {
      const both = sum(line.fixedCostLegs.before, line.fixedCostLegs.from)
      assert.equal(both.billedCents, line.totals.billedCents, line.lineItemId)
      assert.equal(both.actualCents, line.totals.actualCents, line.lineItemId)
      assert.equal(both.marginCents ?? 0, line.totals.marginCents, line.lineItemId)
    }
  }
}

// ---------------------------------------------------------------------------
// The rule
// ---------------------------------------------------------------------------

test("month against the date: before, split, from; a date on the 1st needs no split", () => {
  assert.equal(monthAgainstDate("2026-09", "2026-10-30"), "before")
  assert.equal(monthAgainstDate("2026-10", "2026-10-30"), "split")
  assert.equal(monthAgainstDate("2026-11", "2026-10-30"), "from")
  assert.equal(monthAgainstDate("2026-10", "2026-10-01"), "from")
  assert.equal(monthAgainstDate("2026-10", "2026-10-02"), "split")
  assert.equal(monthAgainstDate("2025-12", "2026-01-15"), "before")
})

test("FC6 split: days before the date are billed at their cost; the fixed cost leg takes the rest", () => {
  // BOSS010PD2 (Taboola), Oct 2026, date 30 Oct.
  const s = splitDateMonth({ billedCents: 136000, actualCents: 63988, marginCents: 72012 }, 59097)
  assert.deepEqual(s.before, { billedCents: 59097, actualCents: 59097, marginCents: 0 })
  assert.deepEqual(s.from, { billedCents: 76903, actualCents: 4891, marginCents: 72012 })
})

test("FC6 floor: cost before the date over the month's billing leaves the fixed cost leg at 0 billed", () => {
  const s = splitDateMonth({ billedCents: 50000, actualCents: 70000, marginCents: -20000 }, 65000)
  assert.deepEqual(s.from, { billedCents: 0, actualCents: 5000, marginCents: -5000 })
  assert.deepEqual(s.before, { billedCents: 50000, actualCents: 65000, marginCents: -15000 })
})

test("no margin in the month: both legs' margins are null, billed and cost still split", () => {
  const s = splitDateMonth({ billedCents: 1000, actualCents: 0, marginCents: null }, 0)
  assert.deepEqual(s.before, { billedCents: 0, actualCents: 0, marginCents: null })
  assert.deepEqual(s.from, { billedCents: 1000, actualCents: 0, marginCents: null })
})

test("unsplit when the day view can't be read; whole months keep their leg", () => {
  const m = { billedCents: 100, actualCents: 40, marginCents: 60 }
  assert.deepEqual(monthLegs("2026-10", "2026-10-30", m, null), { kind: "unsplit" })
  assert.deepEqual(monthLegs("2026-09", "2026-10-30", m, null), { kind: "whole", leg: "before" })
  assert.deepEqual(monthLegs("2026-11", "2026-10-30", m, null), { kind: "whole", leg: "from" })
  assert.equal(lineLegTotals([{ ...m, legs: { kind: "unsplit" } }]), null)
})

test("random integer-cent months: legs add to the month exactly", () => {
  let seed = 31
  const rnd = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return (seed % (2 * n + 1)) - n
  }
  for (let i = 0; i < 2000; i += 1) {
    const billed = rnd(500000)
    const actual = rnd(500000)
    const pre = i % 3 === 0 ? rnd(500000) : Math.abs(rnd(500000))
    const margin = i % 7 === 0 ? null : billed - actual
    const s = splitDateMonth({ billedCents: billed, actualCents: actual, marginCents: margin }, pre)
    assert.deepEqual(sum(s.before, s.from), { billedCents: billed, actualCents: actual, marginCents: margin })
    assert.ok(s.from.billedCents >= 0)
    for (const v of [s.before.billedCents, s.from.billedCents, s.before.actualCents, s.from.actualCents]) {
      assert.ok(Number.isInteger(v))
    }
  }
})

// ---------------------------------------------------------------------------
// Live-shaped: BOSS010PD1, BOSS010PD2, BOSS011PD1, BOSS011PD2, date 30 Oct 2026
// ---------------------------------------------------------------------------

const EXPECTED_OCT: Record<string, { before: FixedCostLegAmounts; from: FixedCostLegAmounts }> = {
  boss010pd1: {
    before: { billedCents: 163388, actualCents: 163388, marginCents: 0 },
    from: { billedCents: 6612, actualCents: 6562, marginCents: 50 },
  },
  boss010pd2: {
    before: { billedCents: 59097, actualCents: 59097, marginCents: 0 },
    from: { billedCents: 76903, actualCents: 4891, marginCents: 72012 },
  },
  boss011pd1: {
    before: { billedCents: 46109, actualCents: 46109, marginCents: 0 },
    from: { billedCents: 33971, actualCents: 3867, marginCents: 30104 },
  },
  boss011pd2: {
    before: { billedCents: 77117, actualCents: 77117, marginCents: 0 },
    from: { billedCents: 2883, actualCents: 2870, marginCents: 13 },
  },
}

const EXPECTED_LINE_LEGS: Record<string, { before: FixedCostLegAmounts; from: FixedCostLegAmounts }> = {
  boss010pd1: {
    before: { billedCents: 333388, actualCents: 333393, marginCents: -5 },
    from: { billedCents: 176612, actualCents: 47014, marginCents: 129598 },
  },
  boss010pd2: {
    before: { billedCents: 195097, actualCents: 120999, marginCents: 74098 },
    from: { billedCents: 212903, actualCents: 24199, marginCents: 188704 },
  },
  boss011pd1: {
    before: { billedCents: 126189, actualCents: 94426, marginCents: 31763 },
    from: { billedCents: 153971, actualCents: 17849, marginCents: 136122 },
  },
  boss011pd2: {
    before: { billedCents: 157117, actualCents: 326857, marginCents: -169740 },
    from: { billedCents: 122883, actualCents: 29024, marginCents: 93859 },
  },
}

test("BOSS, 30 Oct: October splits by FC6, Aug and Sep are before, Nov is fixed cost", () => {
  const lines = bossLines({ from: BOSS_FROM, pre: bossPreDateSpend() })
  assert.equal(lines.length, 4)
  for (const line of lines) {
    const lid = line.lineItemId.toLowerCase()
    for (const m of line.months) {
      if (m.month === "2026-10") assert.deepEqual(m.legs, { kind: "split", ...EXPECTED_OCT[lid]! }, lid)
      else if (m.month < "2026-10") assert.deepEqual(m.legs, { kind: "whole", leg: "before" }, `${lid} ${m.month}`)
      else assert.deepEqual(m.legs, { kind: "whole", leg: "from" }, `${lid} ${m.month}`)
    }
    assert.deepEqual(line.fixedCostLegs, EXPECTED_LINE_LEGS[lid], lid)
  }
  assertLegsAddUp(lines)
})

test("BOSS, 30 Oct: the fixed cost leg billed equals FC6 reported spend for 30 and 31 Oct (B23 review)", () => {
  const lines = bossLines({ from: BOSS_FROM, pre: bossPreDateSpend() })
  const oct = (lid: string) => lines.find((l) => l.lineItemId.toLowerCase() === lid)!.months.find((m) => m.month === "2026-10")!
  const legs = (lid: string) => oct(lid).legs as { kind: "split"; from: FixedCostLegAmounts }
  // REVIEW-B23: Taboola BOSS lines report $769.03 and $339.71 over 30 and 31 Oct under FC6.
  assert.equal(legs("boss010pd2").from.billedCents, 76903)
  assert.equal(legs("boss011pd1").from.billedCents, 33971)
})

test("totals pin: every line, month and report total equals the switch-off output", () => {
  const off = bossLines()
  const on = bossLines({ from: BOSS_FROM, pre: bossPreDateSpend() })
  assert.deepEqual(withoutFc9(on), withoutFc9(off))
  for (let i = 0; i < off.length; i += 1) assert.deepEqual(on[i]!.totals, off[i]!.totals)
  const sOff = summariseFixedCostMargin(off)
  const sOn = summariseFixedCostMargin(on)
  assert.deepEqual(sOn, sOff)
  assert.equal(sOn.grand.marginCents, BOSS_TODAY_MARGIN_CENTS)
  for (const month of ["2026-08", "2026-09", "2026-10", "2026-11"]) {
    assert.deepEqual(totalsForLines(on, month), totalsForLines(off, month), month)
  }
  // The legs over all lines add to the report's margin.
  const legMargin = on.reduce(
    (a, l) => a + (l.fixedCostLegs!.before.marginCents ?? 0) + (l.fixedCostLegs!.from.marginCents ?? 0),
    0,
  )
  assert.equal(legMargin, BOSS_TODAY_MARGIN_CENTS)
})

test("switch off: no date on any cell gives no FC9 keys, whatever pre-date map is passed", () => {
  const plain = bossLines()
  const withMap = bossLines({ pre: bossPreDateSpend() })
  const withNull = bossLines({ pre: null })
  assert.equal(JSON.stringify(withMap), JSON.stringify(plain))
  assert.equal(JSON.stringify(withNull), JSON.stringify(plain))
  assert.doesNotMatch(JSON.stringify(plain), /fixedCostFrom|"legs"|fixedCostLegs/)
})

test("day view unavailable: October unsplit, no line legs, totals still unchanged", () => {
  const off = bossLines()
  const on = bossLines({ from: BOSS_FROM, pre: null })
  for (const line of on) {
    assert.deepEqual(line.months.find((m) => m.month === "2026-10")!.legs, { kind: "unsplit" })
    assert.equal("fixedCostLegs" in line, false)
    assert.equal(lineFlagLabels(line)[0], "Fixed cost from 30 Oct 2026")
  }
  assert.deepEqual(withoutFc9(on), withoutFc9(off))
  assert.match(FIXED_COST_FROM_UNSPLIT_NOTE, /VW_PLATFORM_SPEND_LINE_DAY/)
})

test("a line with no spend before the date in its map entry counts 0 before the date", () => {
  const pre = bossPreDateSpend()
  pre.delete("boss010pd2")
  const line = bossLines({ from: BOSS_FROM, pre }).find((l) => l.lineItemId === "BOSS010PD2")!
  const oct = line.months.find((m) => m.month === "2026-10")!
  assert.deepEqual(oct.legs, {
    kind: "split",
    before: { billedCents: 0, actualCents: 0, marginCents: 0 },
    from: { billedCents: 136000, actualCents: 63988, marginCents: 72012 },
  })
})

test("a date on the 1st: that month is wholly fixed cost, nothing to split", () => {
  const lines = bossLines({ from: "2026-10-01", pre: new Map() })
  for (const line of lines) {
    assert.deepEqual(line.months.find((m) => m.month === "2026-10")!.legs, { kind: "whole", leg: "from" })
    assert.ok(line.fixedCostLegs)
  }
  assertLegsAddUp(lines)
})

test("bill-cost lines: the date is a label only, no legs", () => {
  const plan: FixedCostPlanCell[] = [
    {
      ...bossPlan(BOSS_FROM)[0]!,
      lineItemId: "BOSS010PV1",
      publisher: "Channel Factory",
      platform: "Channel Factory",
      costBasis: "xero_bill",
      month: "2026-10",
      amountCents: 500000,
    },
  ]
  const bill: LineBillCostCell = {
    lineItemId: "boss010pv1",
    month: "2026-10",
    basis: "billed",
    countedGrossCents: 400000,
    countedRebateCents: 0,
    countedNetCents: 400000,
    pendingNetCents: 0,
    methods: ["cf_placement"],
    statuses: ["AUTHORISED"],
    supplierKinds: ["channel_factory"],
  }
  const [line] = composeFixedCostMargin({
    plan,
    spend: [],
    invoiced: new Set(),
    ...BOSS_RANGE,
    billCosts: [bill],
    preDateSpendCents: new Map([["boss010pv1", 123]]),
  })
  assert.equal(line!.fixedCostFrom, BOSS_FROM)
  assert.equal("fixedCostLegs" in line!, false)
  assert.ok(line!.months.every((m) => !("legs" in m)))
  assert.equal(line!.totals.marginCents, 100000)
})

test("month labels: Before fixed cost, Fixed cost, Split at [date], not split", () => {
  const fmt = (ymd: string) => `<${ymd}>`
  assert.equal(monthLegLabel({ kind: "whole", leg: "before" }, BOSS_FROM, fmt), "Before fixed cost")
  assert.equal(monthLegLabel({ kind: "whole", leg: "from" }, BOSS_FROM, fmt), "Fixed cost")
  const split = splitDateMonth({ billedCents: 1, actualCents: 1, marginCents: 0 }, 0)
  assert.equal(monthLegLabel({ kind: "split", ...split }, BOSS_FROM, fmt), "Split at <2026-10-30>")
  assert.equal(monthLegLabel({ kind: "unsplit" }, BOSS_FROM, fmt), "Date month not split")
})

// ---------------------------------------------------------------------------
// Loader helpers
// ---------------------------------------------------------------------------

test("pre-date windows: dated platform lines, date month in range, not the 1st, one per line", () => {
  const q = { from: "2026-08", to: "2026-11" }
  const plan = bossPlan(BOSS_FROM)
  const windows = preDateWindows(plan, q)
  assert.deepEqual(
    windows,
    BOSS_LINES.map((l) => ({ lineItemId: l.id.toLowerCase(), fromYmd: BOSS_FROM })).sort((a, b) =>
      a.lineItemId.localeCompare(b.lineItemId),
    ),
  )
  assert.deepEqual(preDateWindows(bossPlan(), q), [])
  assert.deepEqual(preDateWindows(bossPlan("2026-10-01"), q), [])
  assert.deepEqual(preDateWindows(bossPlan("2026-12-15"), q), [])
  assert.deepEqual(preDateWindows(bossPlan("2026-07-15"), q), [])
  assert.deepEqual(preDateWindows(bossPlan(BOSS_FROM).map((c) => ({ ...c, costBasis: "xero_bill" as const })), q), [])
})

test("pre-date SQL: the day view, one (line, month start, date) window each, date excluded", () => {
  const { sql, binds } = preDateSpendSql([
    { lineItemId: "boss010pd1", fromYmd: "2026-10-30" },
    { lineItemId: "boss011pd1", fromYmd: "2026-11-05" },
  ])
  assert.match(sql, /FROM ASSEMBLEDVIEW\.MART\.VW_PLATFORM_SPEND_LINE_DAY/)
  assert.equal((sql.match(/\(LINE_ITEM_ID = \? AND DATE_DAY >= \? AND DATE_DAY < \?\)/g) ?? []).length, 2)
  assert.match(sql, /GROUP BY 1/)
  assert.deepEqual(binds, ["boss010pd1", "2026-10-01", "2026-10-30", "boss011pd1", "2026-11-01", "2026-11-05"])
})

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------

test("Excel: a Fixed cost legs sheet only when a line has legs; its rows add to the line", async () => {
  const ExcelJS = (await import("exceljs")).default
  async function load(lines: FixedCostMarginLine[]) {
    const bytes = await buildFixedCostMarginWorkbookBytes(lines, summariseFixedCostMargin(lines), ["n"])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(bytes)
    return wb
  }
  const off = await load(bossLines())
  assert.equal(off.getWorksheet("Fixed cost legs"), undefined)
  const on = await load(bossLines({ from: BOSS_FROM, pre: bossPreDateSpend() }))
  assert.deepEqual(
    on.worksheets.map((w) => w.name),
    ["Line months", "Fixed cost legs", "By client", "By publisher", "By month", "Billed vs delivered", "Bill lines", "Bill match totals", "DV360 vs Five Stones", "Notes"],
  )
  const ws = on.getWorksheet("Fixed cost legs")!
  const rows: unknown[][] = []
  ws.eachRow((r) => rows.push((r.values as unknown[]).slice(1)))
  assert.deepEqual(rows[0], ["Client", "MBA", "Line ID", "Publisher", "Fixed cost from", "Month", "Leg", "Billed", "Actual cost", "Margin $"])
  const pd2 = rows.filter((r) => r[2] === "BOSS010PD2")
  assert.deepEqual(
    pd2.map((r) => [r[5], r[6], r[7], r[8], r[9]]),
    [
      ["2026-09", "Before fixed cost", 1360, 619.02, 740.98],
      ["2026-10", "Before 30 Oct 2026 (actual)", 590.97, 590.97, 0],
      ["2026-10", "Fixed cost from 30 Oct 2026", 769.03, 48.91, 720.12],
      ["2026-11", "Fixed cost", 1360, 193.08, 1166.92],
      ["Total", "Before fixed cost", 1950.97, 1209.99, 740.98],
      ["Total", "Fixed cost", 2129.03, 241.99, 1887.04],
    ],
  )
  const lineMonths = on.getWorksheet("Line months")!
  const header = (lineMonths.getRow(1).values as unknown[]).slice(1)
  const flagsCol = header.indexOf("Flags") + 1
  const flags: string[] = []
  lineMonths.eachRow((r, i) => {
    if (i > 1 && r.getCell(4).value === "BOSS010PD2") flags.push(String(r.getCell(flagsCol).value))
  })
  assert.deepEqual(flags, [
    "Fixed cost from 30 Oct 2026; Before fixed cost",
    "Fixed cost from 30 Oct 2026; Split at 30 Oct 2026",
    "Fixed cost from 30 Oct 2026; Fixed cost",
  ])
})

// ---------------------------------------------------------------------------
// FC3: billing, true-up, accruals and Xero never read the date
// ---------------------------------------------------------------------------

test("FC3: only the margin report's own files read the date, the FC9 switch or the day view", async () => {
  const { readdirSync, readFileSync, statSync } = await import("node:fs")
  const { join, relative } = await import("node:path")
  const repo = join(import.meta.dirname, "../../../../..")
  const roots = [
    "lib/billing",
    "lib/xero",
    "lib/finance",
    "app/api/finance",
    "app/api/xero",
    "app/api/billing",
    "components/finance",
    "components/billing",
  ]
  const allowed = new Set([
    "lib/finance/sections/fixedCostMargin/compose.ts",
    "lib/finance/sections/fixedCostMargin/excel.ts",
    "lib/finance/sections/fixedCostMargin/query.ts",
    "lib/finance/sections/fixedCostMargin/fromDate.ts",
    "lib/finance/sections/fixedCostMargin/fromDate.server.ts",
    "components/finance/sections/costs/CostsFixedCostMarginClient.tsx",
  ])
  const pattern = /fixed_cost_from|fixedCostFrom|fixed_cost_margin_from_date|VW_PLATFORM_SPEND_LINE_DAY|fixedCostMargin\/fromDate|FixedCostLeg|fixedCostLegs/
  const hits: string[] = []
  const walk = (dir: string) => {
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch {
      return
    }
    for (const name of names) {
      const full = join(dir, name)
      if (name === "__tests__" || name === "node_modules") continue
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.tsx?$/.test(name) && pattern.test(readFileSync(full, "utf8"))) hits.push(relative(repo, full))
    }
  }
  for (const r of roots) walk(join(repo, r))
  assert.ok(hits.length >= 5, `scan found the report files: ${hits.join(", ")}`)
  assert.deepEqual(hits.filter((h) => !allowed.has(h)).sort(), [])
})
