/**
 * Codex recurring_rule parser + Sydney date helpers (no DB).
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  descriptionHasPeriod,
  descriptionWithPeriod,
  lastBusinessDaySydneyYmd,
  normaliseRecurringRule,
  parseRecurringRule,
  resolveRecurringDue,
  weekdayOfSydneyYmd,
} from "../recurringRule.js"

describe("parseRecurringRule", () => {
  it("parses monthly day, weekly dow, and lbd", () => {
    assert.deepEqual(parseRecurringRule("monthly:15"), {
      kind: "monthly_day",
      day: 15,
    })
    assert.deepEqual(parseRecurringRule("WEEKLY:FRI"), {
      kind: "weekly",
      dow: "fri",
      weekday: 5,
    })
    assert.deepEqual(parseRecurringRule("monthly:lbd"), {
      kind: "monthly_lbd",
    })
  })

  it("rejects cron-ish and garbage", () => {
    assert.equal(parseRecurringRule("0 0 * * *"), null)
    assert.equal(parseRecurringRule("monthly:0"), null)
    assert.equal(parseRecurringRule("weekly:friday"), null)
    assert.equal(parseRecurringRule(""), null)
  })

  it("normalises to canonical lowercase", () => {
    assert.equal(normaliseRecurringRule("Monthly:LBD"), "monthly:lbd")
    assert.equal(normaliseRecurringRule("weekly:Mon"), "weekly:mon")
    assert.equal(normaliseRecurringRule("bad"), null)
  })
})

describe("Sydney last business day", () => {
  it("skips weekend for Aug 2026 (Sat 29 / Sun 30 / Mon 31 → Mon 31)", () => {
    // Aug 2026: 31 is Monday
    assert.equal(lastBusinessDaySydneyYmd(2026, 8), "2026-08-31")
    assert.equal(weekdayOfSydneyYmd("2026-08-31"), 1)
  })

  it("backs up from Sunday end of May 2026", () => {
    // May 2026: 31 is Sunday → LBD = Fri 29
    assert.equal(lastBusinessDaySydneyYmd(2026, 5), "2026-05-29")
    assert.equal(weekdayOfSydneyYmd("2026-05-31"), 0)
  })
})

describe("resolveRecurringDue", () => {
  it("monthly:lbd fires on Sydney LBD and builds period key", () => {
    // Fri 29 May 2026 10:00 Sydney = 2026-05-29T00:00:00Z
    const now = new Date("2026-05-29T00:00:00.000Z")
    const due = resolveRecurringDue(
      { kind: "monthly_lbd" },
      now
    )
    assert.equal(due.shouldGenerate, true)
    assert.equal(due.period, "2026-05-lbd")
    assert.equal(due.dueYmd, "2026-05-29")
  })

  it("monthly:lbd does not fire the day after", () => {
    const now = new Date("2026-05-30T00:00:00.000Z") // Sat 30 May Sydney
    const due = resolveRecurringDue({ kind: "monthly_lbd" }, now)
    assert.equal(due.shouldGenerate, false)
    assert.equal(due.period, "2026-05-lbd")
  })

  it("weekly:fri fires on Friday Sydney", () => {
    // Fri 7 Aug 2026 12:00 Sydney ≈ 2026-08-07T02:00:00Z
    const now = new Date("2026-08-07T02:00:00.000Z")
    const due = resolveRecurringDue(
      { kind: "weekly", dow: "fri", weekday: 5 },
      now
    )
    assert.equal(due.shouldGenerate, true)
    assert.match(due.period, /^2026-W\d{2}-fri$/)
    assert.equal(due.dueYmd, "2026-08-07")
  })

  it("monthly:15 clamps and matches day", () => {
    const now = new Date("2026-08-15T02:00:00.000Z")
    const due = resolveRecurringDue({ kind: "monthly_day", day: 15 }, now)
    assert.equal(due.shouldGenerate, true)
    assert.equal(due.period, "2026-08-d15")
    assert.equal(due.dueYmd, "2026-08-15")
  })
})

describe("period marker", () => {
  it("stamps and detects period in description", () => {
    const desc = descriptionWithPeriod("2026-08-lbd", "Pull pacing")
    assert.ok(desc.startsWith("[codex-period:2026-08-lbd]"))
    assert.ok(descriptionHasPeriod(desc, "2026-08-lbd"))
    assert.equal(descriptionHasPeriod(desc, "2026-07-lbd"), false)
  })
})
