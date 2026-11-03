/**
 * B23: SP_REFRESH_FIXED_COST_REPORTED_DAILY run in Node against a mock
 * `snowflake` object, from the repo SQL file.
 *
 * 1. Differential: with FIXED_COST_BURSTS_JSON null (fixed_cost_report_net
 *    off) the B23 procedure writes exactly what the 2026-09-16 version wrote
 *    (the copy at 9c64b9d2, in __tests__/fixtures), on random lines.
 * 2. Net mode: net media (FC4), Melbourne days, the date (FC2), the FC6
 *    remainder in cents with its floor at 0, the CM360 estimate before the
 *    date, package time based (P14), the backfill clean-up, the applied basis
 *    and date on the line fact, and the stale-flag fix.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, "../../..")

/** The JavaScript body of a Snowflake JS procedure file (single-quoted literal). */
function procedureBody(sqlPath: string): string {
  const sql = readFileSync(sqlPath, "utf8")
  const start = sql.indexOf("AS '\n")
  const end = sql.lastIndexOf("\n';")
  assert.ok(start > 0 && end > start, `no procedure body in ${sqlPath}`)
  return sql
    .slice(start + 5, end)
    .replace(/''/g, "'")
    .replace(/\\\\/g, "\\")
}

type Fact = {
  lid: string
  table: "PACING_FACT" | "SOCIAL_PACING_FACT" | "SEARCH_PACING_FACT"
  day: string
  spend?: number
  impressions?: number
  clicks?: number
  views?: number
  results?: number
}

type SnapshotLine = {
  id: string
  mba?: string
  name?: string
  buyType: string
  fixedCostMedia?: boolean
  bursts: unknown[]
  sourceTable: string
  assumeSpend?: boolean
  fixedCostFrom?: string | null
  fixedCostBursts?: unknown[] | null
}

type Recorded = {
  daily: unknown[][]
  bursts: unknown[][]
  lines: unknown[][]
  deletes: Array<{ sql: string; binds: unknown[] }>
  updates: Array<{ sql: string; binds: unknown[] }>
  calls: Array<{ sql: string; binds: unknown[] }>
  result: Record<string, unknown>
}

const METRIC: Record<string, keyof Fact> = {
  IMPRESSIONS: "impressions",
  CLICKS: "clicks",
  VIDEO_3S_VIEWS: "views",
  RESULTS: "results",
}

function rs(rows: unknown[][]) {
  let i = -1
  return {
    next: () => ++i < rows.length,
    getColumnValue: (n: number) => rows[i]![n - 1],
  }
}

function runProcedure(
  body: string,
  args: {
    lines: SnapshotLine[]
    facts: Fact[]
    now: string
    filter?: string | null
    backfill?: boolean
    staleCleared?: number
  },
): Recorded {
  const rec: Recorded = { daily: [], bursts: [], lines: [], deletes: [], updates: [], calls: [], result: {} }
  const snowflake = {
    createStatement({ sqlText, binds = [] }: { sqlText: string; binds?: unknown[] }) {
      return {
        execute() {
          const sql = sqlText
          if (/^\s*DELETE/i.test(sql)) {
            rec.deletes.push({ sql, binds })
            return rs([])
          }
          if (/^\s*UPDATE/i.test(sql)) {
            rec.updates.push({ sql, binds })
            return rs([[args.staleCleared ?? 0]])
          }
          if (/^\s*CALL/i.test(sql)) {
            rec.calls.push({ sql, binds })
            return rs([])
          }
          if (sql.includes("MERGE INTO ASSEMBLEDVIEW.MART.FIXED_COST_REPORTED_DAILY_FACT")) {
            for (let i = 0; i < binds.length; i += 16) rec.daily.push(binds.slice(i, i + 16))
            return rs([])
          }
          if (sql.includes("MERGE INTO ASSEMBLEDVIEW.MART.FIXED_COST_BURST_FACT")) {
            rec.bursts.push(binds)
            return rs([])
          }
          if (sql.includes("MERGE INTO ASSEMBLEDVIEW.MART.FIXED_COST_LINE_ITEM_FACT")) {
            rec.lines.push(binds)
            return rs([])
          }
          if (sql.includes("FROM ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT") && sql.includes("QUALIFY")) {
            const want = binds[0] == null ? null : String(binds[0]).toLowerCase()
            const rows = args.lines
              .filter((l) => (l.fixedCostMedia ?? true) || l.assumeSpend)
              .filter((l) => want == null || l.id.toLowerCase() === want)
              .sort((a, b) => (a.id < b.id ? -1 : 1))
              .map((l) => [
                l.id,
                l.mba ?? "krusty001",
                l.name ?? l.id,
                l.buyType,
                l.fixedCostMedia ?? true,
                JSON.stringify(l.bursts),
                l.sourceTable,
                l.assumeSpend === true,
                l.fixedCostFrom ?? null,
                l.fixedCostBursts == null ? null : l.fixedCostBursts,
              ])
            return rs(rows)
          }
          const units = /SUM\((\w+)\) AS UNITS/.exec(sql)
          if (units) {
            const [lid, before] = binds as [string, string]
            const field = METRIC[units[1]!]!
            const byDay = new Map<string, number>()
            for (const f of args.facts) {
              if (f.table !== "PACING_FACT" || f.lid.toLowerCase() !== lid.toLowerCase() || !(f.day < before)) continue
              byDay.set(f.day, (byDay.get(f.day) ?? 0) + Number(f[field] ?? 0))
            }
            return rs([...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([d, u]) => [d, u]))
          }
          if (sql.includes("AS ACTUAL_SPEND")) {
            const table = /FROM ASSEMBLEDVIEW\.MART\.(\w+)/.exec(sql)![1] as Fact["table"]
            const metric = /SUM\((\w+)\) AS ACTUAL_DELIVERABLES/.exec(sql)?.[1]
            const [lid, s, e] = binds as [string, string, string]
            const byDay = new Map<string, [number, number]>()
            for (const f of args.facts) {
              if (f.table !== table || f.lid.toLowerCase() !== lid.toLowerCase() || f.day < s || f.day > e) continue
              const cur = byDay.get(f.day) ?? [0, 0]
              cur[0] += Number(f.spend ?? 0)
              cur[1] += metric ? Number(f[METRIC[metric]!] ?? 0) : 0
              byDay.set(f.day, cur)
            }
            return rs([...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([d, [sp, de]]) => [d, sp, de]))
          }
          throw new Error(`unexpected SQL in mock: ${sql.slice(0, 120)}`)
        },
      }
    },
  }
  const fixedNow = new Date(args.now).getTime()
  class FakeDate extends Date {
    constructor(...a: unknown[]) {
      if (a.length === 0) super(fixedNow)
      else super(...(a as [string]))
    }
    static now() {
      return fixedNow
    }
  }
  const fn = new Function("snowflake", "LINE_ITEM_ID_FILTER", "BACKFILL_MODE", "Date", body)
  rec.result = JSON.parse(fn(snowflake, args.filter ?? null, args.backfill ?? false, FakeDate) as string)
  return rec
}

const NEW = procedureBody(join(repo, "sql/snowflake/mart/procedures/sp_refresh_fixed_cost_reported_daily.sql"))
const OLD = procedureBody(join(here, "fixtures/sp_refresh_fixed_cost_reported_daily.2026-09-16.sql"))

// ---------- 1. Differential, switch off ----------

function lcg(seed: number) {
  let x = seed >>> 0
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0
    return x / 2 ** 32
  }
}

function randomCase(seed: number) {
  const r = lcg(seed)
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!
  const buyTypes = ["cpm", "cpc", "cpv", "cpa", "fixed_cost", "package", "CPM", "bonus"] as const
  const tables = [
    ["media_plan_prog_display", "PACING_FACT"],
    ["media_plan_digi_bvod", "PACING_FACT"],
    ["media_plan_social", "SOCIAL_PACING_FACT"],
    ["media_plan_search", "SEARCH_PACING_FACT"],
  ] as const
  const lines: SnapshotLine[] = []
  const facts: Fact[] = []
  const n = 1 + Math.floor(r() * 4)
  for (let i = 0; i < n; i++) {
    const [sourceTable, table] = pick(tables)
    const id = `krusty${seed}l${i}`
    const bursts: unknown[] = []
    let day = Date.UTC(2026, 6 + Math.floor(r() * 4), 1 + Math.floor(r() * 25))
    const burstCount = 1 + Math.floor(r() * 3)
    for (let b = 0; b < burstCount; b++) {
      const len = 3 + Math.floor(r() * 30)
      const s = new Date(day)
      const e = new Date(day + (len - 1) * 86400000)
      const asInstant = r() < 0.6
      bursts.push({
        startDate: asInstant ? new Date(s.getTime() - 10 * 3600000).toISOString() : s.toISOString().slice(0, 10),
        endDate: asInstant ? new Date(e.getTime() - 10 * 3600000).toISOString() : e.toISOString().slice(0, 10),
        budget: pick(["$1,700.00", "2125", "999.99", "0", "12,500.5"]),
        buyAmount: "$13.00",
        calculatedValue: pick([0, 1, 1000, 130769, 52000.5]),
      })
      for (let d = 0; d < len; d++) {
        if (r() < 0.3) continue
        facts.push({
          lid: id.toUpperCase(),
          table,
          day: new Date(day + d * 86400000).toISOString().slice(0, 10),
          spend: Math.round(r() * 20000) / 100,
          impressions: Math.floor(r() * 9000),
          clicks: Math.floor(r() * 50),
          views: Math.floor(r() * 800),
          results: Math.floor(r() * 5),
        })
      }
      day += (len + Math.floor(r() * 5) - 2) * 86400000
    }
    lines.push({ id, buyType: pick(buyTypes), bursts, sourceTable, assumeSpend: r() < 0.1 })
  }
  const now = new Date(Date.UTC(2026, 7 + Math.floor(r() * 5), 1 + Math.floor(r() * 27), 19, 30)).toISOString()
  return { lines, facts, now, backfill: r() < 0.5 }
}

describe("differential: net basis off is the 2026-09-16 procedure", () => {
  it("200 random cases write the same daily rows, burst facts and line facts", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const c = randomCase(seed)
      const before = runProcedure(OLD, c)
      const after = runProcedure(NEW, c)
      assert.deepEqual(after.daily, before.daily, `daily rows, seed ${seed}`)
      assert.deepEqual(after.bursts, before.bursts, `burst facts, seed ${seed}`)
      assert.deepEqual(
        after.lines.map((l) => l.slice(0, 11)),
        before.lines.map((l) => l.slice(0, 11)),
        `line facts, seed ${seed}`,
      )
      // The three new line-fact binds: backfill flag, no date, no basis.
      for (const l of after.lines) assert.deepEqual(l.slice(11), [c.backfill ? 1 : 0, null, null])
      assert.deepEqual(after.calls, before.calls, `assumed-spend delegation, seed ${seed}`)
      // Off: no new deletes (only the assumed-spend clean-up both versions run).
      assert.deepEqual(after.deletes, before.deletes, `deletes, seed ${seed}`)
      assert.equal(after.result.net_basis_lines, 0)
    }
  })

  it("a filtered backfill CALL is identical too", () => {
    const c = randomCase(7)
    const id = c.lines[0]!.id
    const before = runProcedure(OLD, { ...c, filter: id, backfill: true })
    const after = runProcedure(NEW, { ...c, filter: id, backfill: true })
    assert.deepEqual(after.daily, before.daily)
    assert.deepEqual(after.bursts, before.bursts)
  })
})

// ---------- 2. Net mode ----------

// BOSS010PD1 shape: fee-inclusive $2,125 a month, $1,700 net; stored UTC instants.
const SEP = { startDate: "2026-08-31T14:00:00.000Z", endDate: "2026-09-29T14:00:00.000Z", budget: "$2,125.00", buyAmount: "$13.00", calculatedValue: 130769 }
const OCT = { startDate: "2026-09-30T14:00:00.000Z", endDate: "2026-10-30T13:00:00.000Z", budget: "$2,125.00", buyAmount: "$13.00", calculatedValue: 130769 }
const NET = [
  { index: 0, startDay: "2026-09-01", endDay: "2026-09-30", netMediaCents: 170000 },
  { index: 1, startDay: "2026-10-01", endDay: "2026-10-31", netMediaCents: 170000 },
]

function days(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

function dv360Facts(id: string, perDaySpend: number, perDayImpr: number, from: string, to: string): Fact[] {
  return days(from, to).map((day) => ({ lid: id, table: "PACING_FACT", day, spend: perDaySpend, impressions: perDayImpr }))
}

const sumReported = (rows: unknown[][], burstIndex?: number) =>
  rows.filter((r) => burstIndex == null || r[1] === burstIndex).reduce((s, r) => s + Number(r[3]), 0)

const AFTER_FLIGHT = "2026-11-03T19:30:00.000Z"

describe("net basis on, no date", () => {
  const line: SnapshotLine = {
    id: "krusty001pd1",
    buyType: "cpm",
    bursts: [SEP, OCT],
    sourceTable: "media_plan_prog_display",
    fixedCostBursts: NET,
  }

  it("bursts are Melbourne days and budgets are net media (FC4)", () => {
    const facts = dv360Facts("krusty001pd1", 56.67, 5000, "2026-09-01", "2026-10-31")
    const out = runProcedure(NEW, { lines: [line], facts, now: AFTER_FLIGHT, backfill: true })
    const first = out.daily.filter((r) => r[1] === 0).map((r) => r[2]).sort()
    assert.equal(first[0], "2026-09-01")
    assert.equal(first.at(-1), "2026-09-30")
    assert.equal(out.daily.filter((r) => r[1] === 1).map((r) => r[2]).sort().at(-1), "2026-10-31")
    // Delivered over plan: each burst squares up to its net $1,700, not the $2,125 budget.
    assert.ok(Math.abs(sumReported(out.daily, 0) - 1700) < 1e-6)
    assert.ok(Math.abs(sumReported(out.daily, 1) - 1700) < 1e-6)
    assert.equal(out.daily[0]![7], 1700)
    assert.equal(out.result.net_basis_lines, 1)
    // Line fact: basis applied on a backfill, no date.
    assert.deepEqual(out.lines[0]!.slice(11), [1, null, "net_melbourne"])
  })

  it("backfill deletes rows outside the Melbourne bursts (the old UTC day before each start)", () => {
    const out = runProcedure(NEW, { lines: [line], facts: [], now: AFTER_FLIGHT, backfill: true })
    const del = out.deletes.find((d) => d.sql.includes("FIXED_COST_REPORTED_DAILY_FACT") && d.binds[0] === "krusty001pd1")
    assert.ok(del)
    assert.match(del!.sql, /AND NOT \(\(BURST_INDEX = \? AND DATE_DAY BETWEEN \? AND \?\) OR/)
    assert.deepEqual(del!.binds, ["krusty001pd1", 0, "2026-09-01", "2026-09-30", 1, "2026-10-01", "2026-10-31"])
    const delBurst = out.deletes.find((d) => d.sql.includes("FIXED_COST_BURST_FACT"))
    assert.deepEqual(delBurst!.binds, ["krusty001pd1", 0, 1])
  })

  it("window mode never deletes and keeps the applied basis (IFF on the line fact)", () => {
    const out = runProcedure(NEW, { lines: [line], facts: [], now: "2026-10-20T19:30:00.000Z", backfill: false })
    assert.equal(out.deletes.filter((d) => d.binds[0] === "krusty001pd1").length, 0)
    assert.deepEqual(out.lines[0]!.slice(11), [0, null, "net_melbourne"])
  })

  it("package is time based (P14): even daily net, squared up at the end", () => {
    const pkg = { ...line, id: "krusty001pd9", buyType: "package" }
    const out = runProcedure(NEW, { lines: [pkg], facts: [], now: AFTER_FLIGHT, backfill: true })
    const sep = out.daily.filter((r) => r[1] === 0)
    assert.equal(sep.length, 30)
    assert.ok(Math.abs(sumReported(out.daily, 0) - 1700) < 1e-6)
    assert.equal(sep[0]![6], 0) // no expected deliverables
    assert.equal(sep[0]![13], "fixed_cost")
  })
})

describe("fixed cost from a date (FC2, FC6)", () => {
  const base: SnapshotLine = {
    id: "krusty001pd1",
    buyType: "cpm",
    bursts: [SEP, OCT],
    sourceTable: "media_plan_prog_display",
    fixedCostBursts: NET,
    fixedCostFrom: "2026-10-15",
  }

  it("mid-burst: no rows before the date; the cut burst reports net minus actual before it", () => {
    // $50 a day on 1 to 14 Oct = $700 actual before the date. Remainder $1,000.
    const facts = [
      ...dv360Facts("krusty001pd1", 56.67, 5000, "2026-09-01", "2026-09-30"),
      ...dv360Facts("krusty001pd1", 50, 4000, "2026-10-01", "2026-10-14"),
      ...dv360Facts("krusty001pd1", 40, 6000, "2026-10-15", "2026-10-31"),
    ]
    const out = runProcedure(NEW, { lines: [base], facts, now: AFTER_FLIGHT, backfill: true })
    assert.equal(out.daily.filter((r) => r[1] === 0).length, 0, "September is all actuals")
    const oct = out.daily.filter((r) => r[1] === 1)
    assert.equal(oct.map((r) => r[2]).sort()[0], "2026-10-15")
    assert.equal(oct.length, 17)
    assert.ok(Math.abs(sumReported(oct) - 1000) < 1e-6, String(sumReported(oct)))
    assert.equal(oct[0]![7], 1000) // BURST_BUDGET is the remainder
    assert.equal(oct[0]![8], "2026-10-15") // the cut burst starts on the date
    // Expected for the cut part: plan minus the 56,000 delivered before the date, over 17 days.
    assert.ok(Math.abs(Number(oct[0]![6]) - (130769 - 56000) / 17) < 1e-9)
    // Backfill clean-up keeps only 15 to 31 Oct of burst 1, and drops burst 0's fact.
    const del = out.deletes.find((d) => d.sql.includes("FIXED_COST_REPORTED_DAILY_FACT") && d.binds[0] === "krusty001pd1")
    assert.deepEqual(del!.binds, ["krusty001pd1", 1, "2026-10-15", "2026-10-31"])
    const delBurst = out.deletes.find((d) => d.sql.includes("FIXED_COST_BURST_FACT"))
    assert.deepEqual(delBurst!.binds, ["krusty001pd1", 1])
    // Burst fact: only the cut burst, budget = remainder. Line fact: date applied.
    assert.equal(out.bursts.length, 1)
    assert.equal(out.bursts[0]![1], 1)
    assert.equal(out.bursts[0]![4], 1000)
    assert.equal(out.lines[0]![4], 1000) // LINE_ITEM_TOTAL_BUDGET
    assert.deepEqual(out.lines[0]!.slice(11), [1, "2026-10-15", "net_melbourne"])
    assert.equal(out.result.fixed_cost_from_lines, 1)
  })

  it("so the line totals its plan: actual before + reported from = net", () => {
    const facts = [
      ...dv360Facts("krusty001pd1", 50, 4000, "2026-10-01", "2026-10-14"),
      ...dv360Facts("krusty001pd1", 40, 6000, "2026-10-15", "2026-10-31"),
    ]
    const out = runProcedure(NEW, { lines: [base], facts, now: AFTER_FLIGHT, backfill: true })
    const actualBefore = 14 * 50
    assert.ok(Math.abs(actualBefore + sumReported(out.daily, 1) - 1700) < 1e-6)
  })

  it("overspend before the date: the remainder floors at 0", () => {
    const facts = dv360Facts("krusty001pd1", 150, 9000, "2026-10-01", "2026-10-14") // $2,100 > $1,700
    const out = runProcedure(NEW, { lines: [base], facts, now: AFTER_FLIGHT, backfill: true })
    const oct = out.daily.filter((r) => r[1] === 1)
    assert.ok(oct.length > 0)
    assert.equal(sumReported(oct), 0)
    assert.equal(oct[0]![7], 0)
  })

  it("remainder in cents: $700.005 before rounds half up to 70,001 cents", () => {
    const facts: Fact[] = [{ lid: "krusty001pd1", table: "PACING_FACT", day: "2026-10-02", spend: 700.005, impressions: 1 }]
    const fc = { ...base, buyType: "fixed_cost" }
    const out = runProcedure(NEW, { lines: [fc], facts, now: AFTER_FLIGHT, backfill: true })
    const oct = out.daily.filter((r) => r[1] === 1)
    assert.equal(oct[0]![7], 999.99)
    assert.ok(Math.abs(sumReported(oct) - 999.99) < 1e-6)
  })

  it("fixed_cost buy type: the remainder spreads evenly over the days from the date", () => {
    const facts = dv360Facts("krusty001pd1", 50, 0, "2026-10-01", "2026-10-14")
    const fc = { ...base, buyType: "fixed_cost" }
    const out = runProcedure(NEW, { lines: [fc], facts, now: "2026-10-20T19:30:00.000Z", backfill: true })
    const oct = out.daily.filter((r) => r[1] === 1)
    const passed = oct.filter((r) => String(r[2]) <= "2026-10-20")
    for (const r of passed) assert.ok(Math.abs(Number(r[3]) - 1000 / 17) < 1e-9)
    assert.equal(oct.filter((r) => String(r[2]) > "2026-10-20").every((r) => r[3] === 0), true)
  })

  it("plan deliverables met before the date: the remainder is time based", () => {
    const facts = dv360Facts("krusty001pd1", 10, 20000, "2026-10-01", "2026-10-14") // 280,000 > 130,769
    const out = runProcedure(NEW, { lines: [base], facts, now: AFTER_FLIGHT, backfill: true })
    const oct = out.daily.filter((r) => r[1] === 1)
    assert.equal(oct[0]![13], "fixed_cost")
    assert.ok(Math.abs(sumReported(oct) - (1700 - 140)) < 1e-6)
  })

  it("a date before the burst start reports the whole burst; a later burst too", () => {
    const early = { ...base, fixedCostFrom: "2026-09-01" }
    const facts = dv360Facts("krusty001pd1", 60, 5000, "2026-09-01", "2026-10-31")
    const out = runProcedure(NEW, { lines: [early], facts, now: AFTER_FLIGHT, backfill: true })
    assert.ok(Math.abs(sumReported(out.daily, 0) - 1700) < 1e-6)
    assert.ok(Math.abs(sumReported(out.daily, 1) - 1700) < 1e-6)
  })

  it("a future date: nothing reported yet, no rows before it", () => {
    const future = { ...base, fixedCostFrom: "2026-10-25" }
    const facts = dv360Facts("krusty001pd1", 50, 4000, "2026-10-01", "2026-10-19")
    const out = runProcedure(NEW, { lines: [future], facts, now: "2026-10-20T19:30:00.000Z", backfill: true })
    const oct = out.daily.filter((r) => r[1] === 1)
    assert.equal(oct.map((r) => r[2]).sort()[0], "2026-10-25")
    assert.equal(sumReported(oct), 0)
    // Remainder so far: $1,700 minus $950 before the date (1 to 19 Oct; 20 to 24 Oct has no data yet).
    assert.equal(oct[0]![7], 750)
  })

  it("a date after every burst: nothing reported, everything deleted on backfill", () => {
    const late = { ...base, fixedCostFrom: "2026-12-01" }
    const out = runProcedure(NEW, { lines: [late], facts: [], now: AFTER_FLIGHT, backfill: true })
    assert.equal(out.daily.length, 0)
    const del = out.deletes.find((d) => d.sql.includes("FIXED_COST_REPORTED_DAILY_FACT") && d.binds[0] === "krusty001pd1")
    assert.deepEqual(del!.binds, ["krusty001pd1"])
    assert.doesNotMatch(del!.sql, /AND NOT/)
  })

  it("window mode: only window days on or after the date", () => {
    const facts = dv360Facts("krusty001pd1", 50, 4000, "2026-10-01", "2026-10-20")
    const out = runProcedure(NEW, { lines: [base], facts, now: "2026-10-16T19:30:00.000Z", backfill: false })
    const written = out.daily.map((r) => String(r[2])).sort()
    assert.equal(written[0], "2026-10-15")
    assert.equal(out.deletes.filter((d) => d.binds[0] === "krusty001pd1").length, 0)
  })

  it("the date is ignored without the net basis (both switches must be on)", () => {
    const noNet = { ...base, fixedCostBursts: null }
    const out = runProcedure(NEW, { lines: [noNet], facts: [], now: AFTER_FLIGHT, backfill: true })
    assert.ok(out.daily.some((r) => r[1] === 0))
    assert.equal(out.result.fixed_cost_from_lines, 0)
  })

  it("CM360 direct digital: the actual before the date is the plan-rate estimate", () => {
    // $1,700 net over 130,769 impressions: rate 0.0130000... a 13.0001 CPM.
    const dd: SnapshotLine = { ...base, id: "krusty001dd1", sourceTable: "media_plan_digi_display" }
    const facts: Fact[] = days("2026-10-01", "2026-10-14").map((day) => ({
      lid: "krusty001dd1",
      table: "PACING_FACT",
      day,
      spend: 0,
      impressions: 4000,
    }))
    const out = runProcedure(NEW, { lines: [dd], facts, now: AFTER_FLIGHT, backfill: true })
    const rate = 3400 / (130769 * 2)
    let est = 0
    for (let i = 0; i < 14; i++) est += Math.round(4000 * rate * 100) / 100
    const oct = out.daily.filter((r) => r[1] === 1)
    assert.equal(oct[0]![7], Math.round((1700 - est) * 100) / 100)
  })

  it("CM360 fixed_cost buy type is not estimated: actual before is 0", () => {
    const dd: SnapshotLine = { ...base, id: "krusty001dd2", buyType: "fixed_cost", sourceTable: "media_plan_digi_video" }
    const facts: Fact[] = [{ lid: "krusty001dd2", table: "PACING_FACT", day: "2026-10-03", impressions: 9999 }]
    const out = runProcedure(NEW, { lines: [dd], facts, now: AFTER_FLIGHT, backfill: true })
    assert.equal(out.daily.filter((r) => r[1] === 1)[0]![7], 1700)
  })
})

describe("stale currently-fixed-cost flag (discovery 3.7)", () => {
  it("runs on every call (net basis or not) and reports how many it cleared", () => {
    const out = runProcedure(NEW, { lines: [], facts: [], now: AFTER_FLIGHT, staleCleared: 2 })
    const upd = out.updates.find((u) => u.sql.includes("IS_CURRENTLY_FIXED_COST = FALSE"))
    assert.ok(upd)
    assert.match(upd!.sql, /COALESCE\(s\.FIXED_COST_MEDIA, FALSE\) = FALSE/)
    assert.match(upd!.sql, /COALESCE\(s\.ASSUME_SPEND, FALSE\) = FALSE/)
    assert.equal(out.result.stale_fixed_cost_flags_cleared, 2)
  })

  it("a filtered call only touches that line", () => {
    const out = runProcedure(NEW, { lines: [], facts: [], now: AFTER_FLIGHT, filter: "krusty001pd1" })
    const upd = out.updates.find((u) => u.sql.includes("IS_CURRENTLY_FIXED_COST = FALSE"))
    assert.deepEqual(upd!.binds, ["krusty001pd1"])
  })
})
