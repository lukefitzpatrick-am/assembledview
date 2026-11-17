/**
 * B43 (B34 Q4), B49: one Melbourne date helper family. B43 made the pacing
 * "today" (`pacingWindow`), `maths.getAsOfDate`, `maths.getMelbourneYesterdayISO`
 * and `resolveMonthLocks.currentSydneyMonth` delegate to `lib/dates`; B49
 * deleted those wrappers and their importers call `lib/dates` directly.
 * Each `lib/dates` function gives the same output as the old body (copied
 * verbatim below) over a 3-year sweep of instants (every hour of 2025 to
 * 2027, plus every minute for two hours either side of each daylight saving
 * change and each month boundary), and Sydney and Melbourne share one zone
 * over the sweep.
 */
// UTC, the CI and Vercel zone: host-local date code fails here on a Sydney host too (RELFIX1, B49 R5).
process.env.TZ = "UTC"

import assert from "node:assert/strict"
import test, { mock } from "node:test"

import { addDaysISO } from "../civil"
import { getMelbourneMonthISO, getMelbourneTodayISO, getMelbourneYesterdayISO as datesYesterday, melbourneParts } from "../melbourne"
import { getPacingWindow } from "../../pacing/pacingWindow"

// ---------------------------------------------------------------------------
// The old bodies (before B43). B43fix (R4): each old body built a new
// Intl.DateTimeFormat per call (about 150k over the sweep, 3 GB peak, an OOM
// kill beside vitest). Their options are constant, so the three formatters
// are built once here; the bodies are otherwise verbatim and give the same
// outputs.
// ---------------------------------------------------------------------------

const MELBOURNE_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Australia/Melbourne",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})
const SYDNEY_MONTH = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Australia/Sydney",
  year: "numeric",
  month: "2-digit",
})
const SYDNEY_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" })

function oldPacingToday(now: Date): string {
  const formatter = MELBOURNE_DAY
  const parts = formatter.formatToParts(now)
  const year = parts.find((p) => p.type === "year")?.value ?? ""
  const month = parts.find((p) => p.type === "month")?.value ?? ""
  const day = parts.find((p) => p.type === "day")?.value ?? ""
  return `${year}-${month}-${day}`
}

function oldGetAsOfDate(now: Date): string {
  return MELBOURNE_DAY.format(now)
}

function oldMathsYesterday(asOfDate: string): string {
  const today = asOfDate
  const ms = Date.parse(today + "T00:00:00Z")
  if (!Number.isFinite(ms)) throw new Error(`Invalid asOfDate: ${today}`)
  const yesterday = new Date(ms - 86_400_000)
  const yyyy = yesterday.getUTCFullYear()
  const mm = String(yesterday.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(yesterday.getUTCDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function oldCurrentSydneyMonth(now: Date): string {
  const parts = SYDNEY_MONTH.formatToParts(now)
  const y = parts.find((p) => p.type === "year")?.value
  const m = parts.find((p) => p.type === "month")?.value
  return `${y}-${m}`
}

function sydneyDay(now: Date): string {
  return SYDNEY_DAY.format(now)
}

// ---------------------------------------------------------------------------
// The sweep: every hour of 2025 to 2027, and every minute within two hours of
// each DST change (first Sunday of April and October, 03:00 / 02:00 local)
// and each Melbourne month boundary.
// ---------------------------------------------------------------------------

const HOUR = 3_600_000
const MINUTE = 60_000

function sweep(): Date[] {
  const out: Date[] = []
  for (let t = Date.UTC(2025, 0, 1); t < Date.UTC(2028, 0, 1); t += HOUR) out.push(new Date(t))
  const edges: number[] = [
    // DST ends (AEDT -> AEST) at 03:00 AEDT = 16:00Z the day before; starts at 02:00 AEST = 16:00Z the day before.
    Date.UTC(2025, 3, 5, 16), Date.UTC(2025, 9, 4, 16),
    Date.UTC(2026, 3, 4, 16), Date.UTC(2026, 9, 3, 16),
    Date.UTC(2027, 3, 3, 16), Date.UTC(2027, 9, 2, 16),
  ]
  for (let y = 2025; y <= 2027; y += 1) {
    for (let m = 0; m < 12; m += 1) {
      // Melbourne midnight on the 1st is 13:00Z or 14:00Z the day before: cover both.
      edges.push(Date.UTC(y, m, 1) - 11 * HOUR, Date.UTC(y, m, 1) - 10 * HOUR)
    }
  }
  for (const e of edges) for (let t = e - 2 * HOUR; t <= e + 2 * HOUR; t += MINUTE) out.push(new Date(t))
  return out
}

const INSTANTS = sweep()

/** The old outputs, computed once per instant. */
const OLD = INSTANTS.map((d) => ({ d, day: oldGetAsOfDate(d), sydneyDay: sydneyDay(d), sydneyMonth: oldCurrentSydneyMonth(d) }))

function same(actual: string, expected: string, what: string, d: Date): void {
  if (actual !== expected) assert.fail(`${what} at ${d.toISOString()}: ${actual} !== ${expected}`)
}

test("the sweep is three years plus the edges", () => {
  assert.ok(INSTANTS.length > 26_000 + 48 * 240, String(INSTANTS.length))
})

test("Sydney and Melbourne are one zone over the whole sweep (day and month)", () => {
  for (const o of OLD) {
    same(o.sydneyDay, o.day, "Sydney day", o.d)
    same(o.sydneyMonth, o.day.slice(0, 7), "Sydney month", o.d)
  }
})

test("lib/dates gives the old currentSydneyMonth and getAsOfDate outputs at every instant", () => {
  for (const o of OLD) {
    same(getMelbourneTodayISO(o.d), o.day, "getMelbourneTodayISO", o.d)
    same(melbourneParts(o.d).ymd, o.day, "melbourneParts", o.d)
    same(getMelbourneMonthISO(o.d), o.sydneyMonth, "getMelbourneMonthISO", o.d)
  }
})

test("addDaysISO(day, -1) gives the old maths yesterday for every day of the sweep, and lib/dates yesterday agrees", () => {
  for (const o of OLD) {
    const want = oldMathsYesterday(o.day)
    same(addDaysISO(o.day, -1), want, "addDaysISO yesterday", o.d)
    same(datesYesterday(o.d), want, "lib/dates yesterday", o.d)
  }
  assert.equal(addDaysISO("2028-03-01", -1), "2028-02-29")
  assert.equal(addDaysISO("2026-12-31", 1), "2027-01-01")
})

test("addDaysISO(day, -1): a bad date throws where the old maths yesterday threw, and agrees where it did not", () => {
  for (const bad of ["abc", "2026-1-5", "", "2026-13-01", "2026-02-30", "2026-02-31", "2026-04-31", " 2026-01-01"]) {
    let oldErr: unknown = null
    let newErr: unknown = null
    let oldOut: string | null = null
    let newOut: string | null = null
    try {
      oldOut = oldMathsYesterday(bad)
    } catch (e) {
      oldErr = e
    }
    try {
      newOut = addDaysISO(bad, -1)
    } catch (e) {
      newErr = e
    }
    assert.equal(newOut, oldOut, bad)
    assert.equal(newErr == null, oldErr == null, bad)
  }
})

test("the no-argument forms read the clock the same way (today, yesterday, the pacing window)", (t) => {
  for (const d of INSTANTS.filter((_, i) => i % 97 === 0)) {
    t.mock.timers.enable({ apis: ["Date"], now: d.getTime() })
    try {
      assert.equal(getMelbourneTodayISO(), oldPacingToday(d), d.toISOString())
      assert.equal(getMelbourneTodayISO(), oldGetAsOfDate(d), d.toISOString())
      assert.equal(datesYesterday(), oldMathsYesterday(oldGetAsOfDate(d)), d.toISOString())
      const today = oldPacingToday(d)
      assert.deepEqual(getPacingWindow("2025-01-01", "2026-06-30"), {
        campaignStartISO: "2025-01-01",
        campaignEndISO: "2026-06-30",
        asAtISO: "2026-06-30" < today ? "2026-06-30" : today,
      })
    } finally {
      t.mock.timers.reset()
    }
  }
  void mock
})
