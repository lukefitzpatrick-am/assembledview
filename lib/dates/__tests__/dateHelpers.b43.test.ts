/**
 * B43 (B34 Q4): one Melbourne date helper family. `lib/pacing/pacingWindow`
 * (`getMelbourneTodayISO`), `lib/pacing/maths` (`getAsOfDate`,
 * `getMelbourneYesterdayISO`) and `resolveMonthLocks.currentSydneyMonth`
 * delegate to `lib/dates/melbourne.ts`. Pure refactor: each new function
 * gives the same output as its old body (copied verbatim below) over a
 * 3-year sweep of instants (every hour of 2025 to 2027, plus every minute
 * for two hours either side of each daylight saving change and each month
 * boundary), and Sydney and Melbourne share one zone over the sweep.
 */
import assert from "node:assert/strict"
import test, { mock } from "node:test"

import { getMelbourneMonthISO, getMelbourneTodayISO, getMelbourneYesterdayISO as datesYesterday, shiftISODate } from "../melbourne"
import { getMelbourneTodayISO as pacingToday, getPacingWindow } from "../../pacing/pacingWindow"
import { getAsOfDate, getMelbourneYesterdayISO as mathsYesterday } from "../../pacing/maths"
import { currentSydneyMonth } from "../../finance/revisions/resolveMonthLocks"

// ---------------------------------------------------------------------------
// The old bodies, verbatim (before B43).
// ---------------------------------------------------------------------------

function oldPacingToday(now: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  const parts = formatter.formatToParts(now)
  const year = parts.find((p) => p.type === "year")?.value ?? ""
  const month = parts.find((p) => p.type === "month")?.value ?? ""
  const day = parts.find((p) => p.type === "day")?.value ?? ""
  return `${year}-${month}-${day}`
}

function oldGetAsOfDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
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
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now)
  const y = parts.find((p) => p.type === "year")?.value
  const m = parts.find((p) => p.type === "month")?.value
  return `${y}-${m}`
}

function sydneyDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
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

test("the sweep is three years plus the edges", () => {
  assert.ok(INSTANTS.length > 26_000 + 48 * 240, String(INSTANTS.length))
})

test("Sydney and Melbourne are one zone over the whole sweep (day and month)", () => {
  for (const d of INSTANTS) {
    assert.equal(sydneyDay(d), oldGetAsOfDate(d), d.toISOString())
    assert.equal(oldCurrentSydneyMonth(d), oldGetAsOfDate(d).slice(0, 7), d.toISOString())
  }
})

test("currentSydneyMonth, getAsOfDate and lib/dates give the old outputs at every instant", () => {
  for (const d of INSTANTS) {
    assert.equal(currentSydneyMonth(d), oldCurrentSydneyMonth(d), d.toISOString())
    assert.equal(getAsOfDate(d), oldGetAsOfDate(d), d.toISOString())
    assert.equal(getMelbourneTodayISO(d), oldGetAsOfDate(d), d.toISOString())
    assert.equal(getMelbourneMonthISO(d), oldCurrentSydneyMonth(d), d.toISOString())
  }
})

test("maths getMelbourneYesterdayISO (with a date) gives the old output for every day of the sweep, and lib/dates agrees", () => {
  for (const d of INSTANTS) {
    const today = oldGetAsOfDate(d)
    assert.equal(mathsYesterday(today), oldMathsYesterday(today), today)
    assert.equal(datesYesterday(d), oldMathsYesterday(today), d.toISOString())
  }
  assert.equal(shiftISODate("2028-03-01", -1), "2028-02-29")
  assert.equal(shiftISODate("2026-12-31", 1), "2027-01-01")
})

test("maths getMelbourneYesterdayISO: a bad date still throws the same error", () => {
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
      newOut = mathsYesterday(bad)
    } catch (e) {
      newErr = e
    }
    assert.equal(newOut, oldOut, bad)
    assert.equal(String(newErr), String(oldErr), bad)
  }
})

test("the no-argument forms read the clock the same way (pacing today, maths today and yesterday, the pacing window)", (t) => {
  for (const d of INSTANTS.filter((_, i) => i % 97 === 0)) {
    t.mock.timers.enable({ apis: ["Date"], now: d.getTime() })
    try {
      assert.equal(pacingToday(), oldPacingToday(d), d.toISOString())
      assert.equal(getAsOfDate(), oldGetAsOfDate(d), d.toISOString())
      assert.equal(mathsYesterday(), oldMathsYesterday(oldGetAsOfDate(d)), d.toISOString())
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
