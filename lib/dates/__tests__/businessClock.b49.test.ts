/**
 * B49 (S30): the lib/dates API over the B43 sweep (every hour of 2025 to
 * 2027, every minute for two hours either side of each daylight saving
 * change and each Melbourne month boundary), plus the Sydney proof.
 */
// UTC, the CI and Vercel zone: host-local date code fails here on a Sydney host too (RELFIX1, B49 R5).
process.env.TZ = "UTC"

import assert from "node:assert/strict"
import test from "node:test"

import { addDaysISO, addMonthsISO, daysBetweenISO } from "../civil"
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

// The one-pass copy B49 kept (duePlans.sydneyMidnightUtc, myhours overlap, dashboard makeZonedDate), verbatim in shape (C-276).
const OLD_FMT = new Intl.DateTimeFormat("en-US", { timeZone: "Australia/Sydney", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
function oldZoned(y: number, m: number, d: number, h: number, mi: number): number {
  const desired = Date.UTC(y, m - 1, d, h, mi, 0)
  const p = Object.fromEntries(OLD_FMT.formatToParts(new Date(desired)).filter((x) => x.type !== "literal").map((x) => [x.type, Number(x.value)]))
  return desired - (Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!) - desired)
}

test("melbourneInstant round-trips every hour of 2025 to 2027; a repeated hour gives its first instant (C-276)", () => {
  for (let t = Date.UTC(2025, 0, 1); t < Date.UTC(2028, 0, 1); t += HOUR) {
    const p = melbourneParts(new Date(t))
    const got = melbourneInstant(p.year, p.month, p.day, p.hour, p.minute).getTime()
    // The second 02:00 to 02:59 when daylight saving ends reads the first one.
    const repeat = p.hour === 2 && melbourneParts(new Date(t - HOUR)).hour === 2
    assert.equal(got, repeat ? t - HOUR : t, new Date(t).toISOString())
  }
})

test("melbourneInstant on change days: the rule for skipped and repeated times, and the hours the one-pass copy got wrong", () => {
  const at = (y: number, m: number, d: number, h = 0, mi = 0) => melbourneInstant(y, m, d, h, mi).toISOString()
  // Daylight saving ends Sun 5 Apr 2026 03:00 AEDT (16:00Z): 02:00 to 02:59 happens twice.
  assert.equal(at(2026, 4, 5, 2, 30), "2026-04-04T15:30:00.000Z", "repeated: the first, AEDT, instant")
  assert.equal(at(2026, 4, 5, 3), "2026-04-04T17:00:00.000Z", "03:00 AEST")
  assert.equal(at(2026, 4, 5), "2026-04-04T13:00:00.000Z", "midnight of the change Sunday (the copy said 14:00Z)")
  assert.equal(at(2026, 4, 4, 20), "2026-04-04T09:00:00.000Z", "Saturday 20:00 AEDT (the copy said 10:00Z)")
  assert.equal(melbourneInstant(2026, 4, 4, 23, 59, 59, 999).toISOString(), "2026-04-04T12:59:59.999Z", "Saturday day end")
  // Daylight saving starts Sun 4 Oct 2026 02:00 AEST (16:00Z): 02:00 to 02:59 does not happen.
  assert.equal(at(2026, 10, 4, 2, 30), "2026-10-03T16:30:00.000Z", "skipped: forward an hour, 03:30 AEDT")
  assert.equal(at(2026, 10, 4, 1, 59), "2026-10-03T15:59:00.000Z", "01:59 AEST")
  assert.equal(at(2026, 10, 4, 3), "2026-10-03T16:00:00.000Z", "03:00 AEDT")
  assert.equal(at(2026, 10, 4), "2026-10-03T14:00:00.000Z", "midnight of the change Sunday")
  assert.equal(at(2026, 12, 1, 8), "2026-11-30T21:00:00.000Z", "1 Dec 08:00 AEDT")
  assert.equal(at(2026, 6, 1, 8), "2026-05-31T22:00:00.000Z", "1 Jun 08:00 AEST")
  assert.equal(at(2026, 7, 0), "2026-06-29T14:00:00.000Z", "day 0 rolls back")
})

test("melbourneInstant differs from the one-pass copy only on the Saturday and Sunday of a change, so every caller changes only then", () => {
  const changeDays = new Set(["2025-04-05", "2025-04-06", "2025-10-04", "2025-10-05", "2026-04-04", "2026-04-05", "2026-10-03", "2026-10-04", "2027-04-03", "2027-04-04", "2027-10-02", "2027-10-03"])
  let differs = 0
  for (let t = Date.UTC(2025, 0, 1); t < Date.UTC(2028, 0, 1); t += HOUR) {
    const p = melbourneParts(new Date(t))
    if (melbourneInstant(p.year, p.month, p.day, p.hour, p.minute).getTime() === oldZoned(p.year, p.month, p.day, p.hour, p.minute)) continue
    differs += 1
    assert.ok(changeDays.has(p.ymd), `${p.ymd} ${p.hour}:00`)
  }
  assert.ok(differs > 0)
})

test("civil maths: add days, months, days between", () => {
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
  for (const bad of ["abc", "2026-1-5", "", "2026-13-01"]) assert.throws(() => addDaysISO(bad, 1), RangeError, bad)
})
