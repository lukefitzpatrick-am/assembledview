/**
 * B49 (S30): the lib/dates API over the B43 sweep (every hour of 2025 to
 * 2027, every minute for two hours either side of each daylight saving
 * change and each Melbourne month boundary), plus the Sydney proof.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { addDaysISO, addMonthsISO, daysBetweenISO, monthEndISO, parseISODate } from "../civil"
import { getMelbourneMonthISO, getMelbourneTodayISO, melbourneInstant, melbourneParts } from "../melbourne"

const HOUR = 3_600_000
const MINUTE = 60_000

function sweep(): Date[] {
  const out: Date[] = []
  for (let t = Date.UTC(2025, 0, 1); t < Date.UTC(2028, 0, 1); t += HOUR) out.push(new Date(t))
  const edges = [Date.UTC(2025, 3, 5, 16), Date.UTC(2025, 9, 4, 16), Date.UTC(2026, 3, 4, 16), Date.UTC(2026, 9, 3, 16), Date.UTC(2027, 3, 3, 16), Date.UTC(2027, 9, 2, 16)]
  for (let y = 2025; y <= 2027; y += 1) for (let m = 0; m < 12; m += 1) edges.push(Date.UTC(y, m, 1) - 11 * HOUR, Date.UTC(y, m, 1) - 10 * HOUR)
  for (const e of edges) for (let t = e - 2 * HOUR; t <= e + 2 * HOUR; t += MINUTE) out.push(new Date(t))
  return out
}
const INSTANTS = sweep()

// An independent reading of the Melbourne wall clock (one formatter, built once).
const REF = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "long",
})
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

test("melbourneParts agrees with an independent formatter at every instant of the sweep", () => {
  for (const d of INSTANTS) {
    const r = Object.fromEntries(REF.formatToParts(d).map((p) => [p.type, p.value]))
    const p = melbourneParts(d)
    const want = { ymd: `${r.year}-${r.month}-${r.day}`, hour: Number(r.hour), minute: Number(r.minute), weekday: DAYS.indexOf(r.weekday!) }
    const got = { ymd: p.ymd, hour: p.hour, minute: p.minute, weekday: p.weekday }
    if (JSON.stringify(got) !== JSON.stringify(want)) assert.fail(`${d.toISOString()}: ${JSON.stringify(got)} !== ${JSON.stringify(want)}`)
  }
})

test("Sydney and Melbourne share one offset at every hour from 2015 to 2040 (why Sydney helpers now call lib/dates)", () => {
  const syd = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
  const mel = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
  for (let t = Date.UTC(2015, 0, 1); t < Date.UTC(2041, 0, 1); t += HOUR) {
    const d = new Date(t)
    if (syd.format(d) !== mel.format(d)) assert.fail(`differ at ${d.toISOString()}`)
  }
})

test("month ends from 00:00 to 11:00 Melbourne on the 1st: Melbourne month, while the UTC month is still the old one", () => {
  for (let y = 2025; y <= 2027; y += 1) {
    for (let m = 1; m <= 12; m += 1) {
      const month = `${y}-${String(m).padStart(2, "0")}`
      for (let h = 0; h <= 11; h += 1) {
        const at = melbourneInstant(y, m, 1, h)
        assert.equal(getMelbourneMonthISO(at), month, `${month} ${h}:00`)
        assert.equal(getMelbourneTodayISO(at), `${month}-01`)
      }
      const before = melbourneInstant(y, m, 1, 0, 0, 0, 0).getTime() - 1
      assert.equal(getMelbourneMonthISO(new Date(before)), addMonthsISO(month, -1), `${month} one ms before`)
    }
  }
})

// The copy B49 replaced (duePlans.sydneyMidnightUtc, myhours overlap, dashboard makeZonedDate), verbatim in shape.
const OLD_FMT = new Intl.DateTimeFormat("en-US", { timeZone: "Australia/Sydney", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
function oldZoned(y: number, m: number, d: number, h: number, mi: number): number {
  const desired = Date.UTC(y, m - 1, d, h, mi, 0)
  const p = Object.fromEntries(OLD_FMT.formatToParts(new Date(desired)).filter((x) => x.type !== "literal").map((x) => [x.type, Number(x.value)]))
  return desired - (Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!) - desired)
}

test("melbourneInstant gives the old one-pass answer for every hour of 2025 to 2027, and round-trips away from a changeover", () => {
  let offByOne = 0
  for (let t = Date.UTC(2025, 0, 1); t < Date.UTC(2028, 0, 1); t += HOUR) {
    const p = melbourneParts(new Date(t))
    const got = melbourneInstant(p.year, p.month, p.day, p.hour, p.minute)
    assert.equal(got.getTime(), oldZoned(p.year, p.month, p.day, p.hour, p.minute), new Date(t).toISOString())
    if (got.getTime() !== t) offByOne += 1
  }
  // shortcut kept from the copies: the hours just before each changeover (about 11 a time, 6 changeovers) read the new offset.
  assert.ok(offByOne > 0 && offByOne <= 6 * 12, String(offByOne))
  assert.equal(melbourneInstant(2026, 12, 1, 8).toISOString(), "2026-11-30T21:00:00.000Z", "1 Dec 08:00 AEDT")
  assert.equal(melbourneInstant(2026, 6, 1, 8).toISOString(), "2026-05-31T22:00:00.000Z", "1 Jun 08:00 AEST")
  assert.equal(melbourneInstant(2026, 7, 0).toISOString(), "2026-06-29T14:00:00.000Z", "day 0 rolls back")
})

test("civil maths: add days, months, month end, days between, parse", () => {
  for (const d of INSTANTS.filter((_, i) => i % 24 === 0)) {
    const day = getMelbourneTodayISO(d)
    assert.equal(addDaysISO(addDaysISO(day, 40), -40), day)
    assert.equal(daysBetweenISO(day, addDaysISO(day, 400)), 400)
  }
  assert.equal(addDaysISO("2028-02-28", 1), "2028-02-29")
  assert.equal(addDaysISO("2026-04-04", 1), "2026-04-05", "a changeover day is one civil day")
  assert.equal(addMonthsISO("2026-12", 1), "2027-01")
  assert.equal(addMonthsISO("2026-01", -1), "2025-12")
  assert.equal(addMonthsISO("2026-11", -25), "2024-10")
  assert.equal(monthEndISO("2028-02"), "2028-02-29")
  assert.equal(monthEndISO("2026-02"), "2026-02-28")
  assert.equal(monthEndISO("2026-12"), "2026-12-31")
  assert.equal(parseISODate(" 2026-02-28 "), "2026-02-28")
  for (const bad of ["2026-02-30", "2026-2-3", "2026-13-01", "2026-11-17T00:00:00Z", "", null, 20261117]) assert.equal(parseISODate(bad), null, String(bad))
  for (const bad of ["abc", "2026-1-5", "", "2026-13-01"]) assert.throws(() => addDaysISO(bad, 1), RangeError, bad)
})
