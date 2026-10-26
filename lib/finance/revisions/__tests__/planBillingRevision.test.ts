/**
 * Golden tests from the design's worked examples (section 3.9), on real
 * schedule_months rows. Today is 26 Oct 2026; the Sydney month is 2026-10.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { planBillingRevision } from "../planBillingRevision"
import type { RevisionInput, RevisionOk, RevisionResult } from "../types"
import {
  BUXTON004_V10,
  BUXTON_CAMPAIGN,
  DEFAULT_OPTIONS,
  PENFOLD020_CAMPAIGN,
  PENFOLD020_V29,
  PENFOLD022_CAMPAIGN,
  PENFOLD022_V3,
  buxtonLocks,
  linesFromRows,
} from "./fixtures"

function ok(r: RevisionResult): RevisionOk {
  if (!r.ok) assert.fail(`expected ok, got ${r.code}: ${r.message}`)
  return r
}

function cellAfter(r: RevisionOk, lineId: string, month: string, comp: "media" | "fee" = "media"): number {
  const after = r.afterCells.find((c) => c.lineItemId === lineId)
  assert.ok(after, `no after cells for ${lineId}`)
  return after[comp][month] ?? 0
}

function buxton(request: RevisionInput["request"], unlock: string[] = []): RevisionResult {
  return planBillingRevision({
    lines: linesFromRows(BUXTON004_V10),
    locks: buxtonLocks(),
    currentMonth: "2026-10",
    campaignMonths: BUXTON_CAMPAIGN,
    request,
    options: { ...DEFAULT_OPTIONS, unlockApprovedMonths: unlock },
  })
}

function penfold020Locks() {
  return [{ month: "2026-10", level: "soft" as const, reasons: ["approved" as const], past: false }]
}

function penfold020(request: RevisionInput["request"], unlock: string[] = ["2026-10"]): RevisionResult {
  return planBillingRevision({
    lines: linesFromRows(PENFOLD020_V29),
    locks: penfold020Locks(),
    currentMonth: "2026-10",
    campaignMonths: PENFOLD020_CAMPAIGN,
    request,
    options: { ...DEFAULT_OPTIONS, unlockApprovedMonths: unlock },
  })
}

function penfold022(request: RevisionInput["request"], includeProduction = false): RevisionResult {
  return planBillingRevision({
    lines: linesFromRows(PENFOLD022_V3),
    locks: [],
    currentMonth: "2026-10",
    campaignMonths: PENFOLD022_CAMPAIGN,
    request,
    options: { ...DEFAULT_OPTIONS, includeProduction },
  })
}

test("E1 buxton004: bill the remainder into Oct (Oct ticked open)", () => {
  const r = ok(buxton({ mode: "bill_remainder", intoMonth: "2026-10" }, ["2026-10"]))
  assert.equal(cellAfter(r, "buxton004DD1", "2026-10"), 1_297_282)
  assert.equal(cellAfter(r, "buxton004DD7", "2026-10"), 1_278_545)
  assert.equal(cellAfter(r, "buxton004DD1", "2026-11"), 0)
  assert.equal(cellAfter(r, "buxton004DD7", "2026-12"), 0)
  assert.equal(r.movedCents, 1_533_878)
  const oct = r.months.find((m) => m.month === "2026-10")!
  assert.equal(oct.total.before, 1_041_949)
  assert.equal(oct.total.after, 2_575_827)
  assert.equal(r.afterCells.length, 2, "DD5, DD6, SM1 have no future months and stay put")
})

test("E1 refused while Oct is approved and not ticked", () => {
  const r = buxton({ mode: "bill_remainder", intoMonth: "2026-10" })
  assert.equal(r.ok, false)
  assert.equal(!r.ok && r.code, "TARGET_LOCKED")
})

test("E2 buxton004: $10,000 earliest first comes from Nov", () => {
  const r = ok(
    buxton({ mode: "bill_amount", intoMonth: "2026-10", amountCents: 1_000_000, strategy: "earliest_first" }, ["2026-10"]),
  )
  assert.equal(cellAfter(r, "buxton004DD1", "2026-11"), 505_435 - 501_124)
  assert.equal(cellAfter(r, "buxton004DD7", "2026-11"), 503_169 - 498_876)
  assert.equal(cellAfter(r, "buxton004DD1", "2026-12"), 269_565)
  assert.equal(cellAfter(r, "buxton004DD1", "2026-10"), 1_023_406)
  assert.equal(cellAfter(r, "buxton004DD7", "2026-10"), 1_018_543)
  assert.equal(r.movedCents, 1_000_000)
})

test("E3 buxton004: $10,000 proportional across Nov and Dec", () => {
  const r = ok(
    buxton({ mode: "bill_amount", intoMonth: "2026-10", amountCents: 1_000_000, strategy: "proportional" }, ["2026-10"]),
  )
  assert.equal(505_435 - cellAfter(r, "buxton004DD1", "2026-11"), 329_516)
  assert.equal(269_565 - cellAfter(r, "buxton004DD1", "2026-12"), 175_740)
  assert.equal(503_169 - cellAfter(r, "buxton004DD7", "2026-11"), 328_037)
  assert.equal(255_709 - cellAfter(r, "buxton004DD7", "2026-12"), 166_707)
})

test("E4 buxton004: underspend Sep DD1 to $4,500 spreads over Nov and Dec", () => {
  const r = ok(
    buxton({ mode: "underspend", month: "2026-09", actualByLine: { buxton004DD1: 450_000 } }, ["2026-09"]),
  )
  assert.equal(cellAfter(r, "buxton004DD1", "2026-09"), 450_000)
  assert.equal(cellAfter(r, "buxton004DD1", "2026-10"), 522_282, "Oct is approved and not ticked")
  assert.equal(cellAfter(r, "buxton004DD1", "2026-11"), 505_435 + 36_154)
  assert.equal(cellAfter(r, "buxton004DD1", "2026-12"), 269_565 + 19_281)
  const total = Object.values(r.afterCells[0]!.media).reduce((s, v) => s + v, 0)
  assert.equal(total, 4_650_000)
})

test("E4 underspend refused on Sep until ticked, and on paid months", () => {
  const soft = buxton({ mode: "underspend", month: "2026-09", actualByLine: { buxton004DD1: 1 } })
  assert.equal(!soft.ok && soft.code, "SOURCE_LOCKED")
  const hard = buxton({ mode: "underspend", month: "2026-04", actualByLine: { buxton004DD1: 1 } })
  assert.equal(!hard.ok && hard.code, "MONTH_HARD_LOCKED")
})

test("Q5 underspend with no months left asks for a choice", () => {
  const r = buxton({ mode: "underspend", month: "2026-09", actualByLine: { buxton004DD5: 100_000 } }, ["2026-09"])
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.code, "UNDERSPEND_NEEDS_CHOICE")
  assert.deepEqual(r.choicesNeeded, [
    { lineItemId: "buxton004DD5", label: "buxton004DD5", gapCents: 54_839, lastMonth: null },
  ])
})

test("Q5 credit is a note only: no cells change", () => {
  const r = ok(
    buxton(
      { mode: "underspend", month: "2026-09", actualByLine: { buxton004DD5: 100_000 }, noRemaining: { buxton004DD5: "credit" } },
      ["2026-09"],
    ),
  )
  assert.equal(r.afterCells.length, 0)
  assert.deepEqual(r.credits, [{ lineItemId: "buxton004DD5", month: "2026-09", cents: 54_839 }])
  assert.equal(r.movedCents, 0)
})

test("Q5 last month: Aug underspend on DD5 goes to Sep once Sep is ticked", () => {
  const blocked = buxton({
    mode: "underspend",
    month: "2026-08",
    actualByLine: { buxton004DD5: 200_000 },
    noRemaining: { buxton004DD5: "last_month" },
  })
  assert.equal(!blocked.ok && blocked.code, "LAST_MONTH_UNAVAILABLE")
  const r = ok(
    buxton(
      { mode: "underspend", month: "2026-08", actualByLine: { buxton004DD5: 200_000 }, noRemaining: { buxton004DD5: "last_month" } },
      ["2026-09"],
    ),
  )
  assert.equal(cellAfter(r, "buxton004DD5", "2026-08"), 200_000)
  assert.equal(cellAfter(r, "buxton004DD5", "2026-09"), 154_839 + 95_161)
})

test("underspend refuses an actual above plan or below zero", () => {
  const above = buxton({ mode: "underspend", month: "2026-08", actualByLine: { buxton004DD1: 600_000 } })
  assert.equal(!above.ok && above.code, "UNDERSPEND_ACTUAL_ABOVE_PLAN")
  const neg = buxton({ mode: "underspend", month: "2026-08", actualByLine: { buxton004DD1: -1 } })
  assert.equal(!neg.ok && neg.code, "UNDERSPEND_ACTUAL_NEGATIVE")
})

test("E5 PENFOLD020: $100k earliest first takes it all from Nov", () => {
  const r = ok(
    penfold020({ mode: "bill_amount", intoMonth: "2026-10", amountCents: 10_000_000, strategy: "earliest_first" }),
  )
  const m = (k: string) => r.months.find((x) => x.month === k)!
  assert.equal(m("2026-11").media.before - m("2026-11").media.after, 10_000_000)
  assert.equal(m("2026-11").media.after, 15_093)
  assert.equal(m("2026-12").media.after, m("2026-12").media.before)
  assert.equal(m("2027-01").media.after, m("2027-01").media.before)
  assert.equal(m("2026-10").total.before, 1_416_067)
  assert.equal(m("2026-10").total.after, 11_416_067)
  assert.equal(m("2026-11").production.after, 702_843, "production stays in its month")
  assert.equal(m("2026-10").adserving.after, 1_542, "PD1 ad serving (client pays) stays")
  assert.equal(r.lines.find((l) => l.lineItemId === "PENFOLD020PD1")!.skipped, "client_pays")
  assert.equal(r.lines.find((l) => l.lineItemId === "PENFOLD020PROD1")!.skipped, "production")
})

// The design's E5 proportional row was rounded per month ($24,834.05 /
// $72,621.19 / $2,544.76). The allocator rounds per line-month cell (as in
// the design's pseudo-code and E3), so the month figures differ by up to 17c.
test("E5 PENFOLD020: $100k proportional", () => {
  const r = ok(
    penfold020({ mode: "bill_amount", intoMonth: "2026-10", amountCents: 10_000_000, strategy: "proportional" }),
  )
  const taken = (k: string) => {
    const x = r.months.find((m) => m.month === k)!
    return x.media.before - x.media.after
  }
  assert.equal(taken("2026-11"), 2_483_392)
  assert.equal(taken("2026-12"), 7_262_136)
  assert.equal(taken("2027-01"), 254_472)
  assert.equal(r.months.find((m) => m.month === "2026-11")!.media.after, 7_531_701)
  assert.equal(r.months.find((m) => m.month === "2026-10")!.total.after, 11_416_067)
})

test("E6 PENFOLD020: $500k is refused with what is available", () => {
  const r = penfold020({ mode: "bill_amount", intoMonth: "2026-10", amountCents: 50_000_000, strategy: "earliest_first" })
  assert.equal(r.ok, false)
  assert.equal(!r.ok && r.code, "AMOUNT_EXCEEDS_AVAILABLE")
  assert.equal(!r.ok && r.availableCents, 40_328_062)
})

test("E7 penfold022: pull Dec into Nov, production stays", () => {
  const r = ok(penfold022({ mode: "pull_month", fromMonth: "2026-12", intoMonth: "2026-11" }))
  assert.equal(cellAfter(r, "penfold022SM1", "2026-11"), 750_000)
  assert.equal(cellAfter(r, "penfold022SM2", "2026-11"), 150_000)
  assert.equal(cellAfter(r, "penfold022SM3", "2026-11"), 500_000)
  assert.equal(cellAfter(r, "penfold022SM4", "2026-11"), 100_000)
  const nov = r.months.find((m) => m.month === "2026-11")!
  const dec = r.months.find((m) => m.month === "2026-12")!
  assert.equal(nov.media.before, 2_103_570)
  assert.equal(nov.media.after, 2_799_999)
  assert.equal(dec.media.after, 0)
  assert.equal(dec.production.after, 337_931)
})

test("E7 with Include production moves PROD1 too", () => {
  const r = ok(penfold022({ mode: "pull_month", fromMonth: "2026-12", intoMonth: "2026-11" }, true))
  assert.equal(cellAfter(r, "penfold022PROD1", "2026-11"), 700_000)
})

test("E8 (Q8 changed): bill into Oct before the campaign starts is a prebill", () => {
  const r = ok(penfold022({ mode: "bill_remainder", intoMonth: "2026-10" }))
  const oct = r.months.find((m) => m.month === "2026-10")!
  assert.equal(oct.media.after, 2_799_999)
  assert.ok(r.warnings.some((w) => w.code === "PREBILL_BEFORE_START"))
})

test("targets in the past or after the campaign are refused", () => {
  const past = penfold022({ mode: "bill_remainder", intoMonth: "2026-09" })
  assert.equal(!past.ok && past.code, "TARGET_IN_PAST")
  const after = penfold022({ mode: "bill_remainder", intoMonth: "2027-01" })
  assert.equal(!after.ok && after.code, "TARGET_OUTSIDE_CAMPAIGN")
})

test("amount must be positive", () => {
  const r = penfold022({ mode: "bill_amount", intoMonth: "2026-11", amountCents: 0, strategy: "earliest_first" })
  assert.equal(!r.ok && r.code, "AMOUNT_NOT_POSITIVE")
})

test("fee follows media on a 25% fee line, and keep leaves it", () => {
  const lines = [
    {
      lineItemId: "X1",
      label: "X1",
      channel: "social",
      isProduction: false,
      clientPaysForMedia: false,
      isAaLine: false,
      media: { "2026-11": 100_000, "2026-12": 100_000 },
      fee: { "2026-11": 25_000, "2026-12": 25_000 },
      adserving: {},
    },
  ]
  const base = {
    lines,
    locks: [],
    currentMonth: "2026-10",
    campaignMonths: ["2026-11", "2026-12"],
    request: { mode: "pull_month" as const, fromMonth: "2026-12", intoMonth: "2026-11" },
  }
  const follow = ok(planBillingRevision({ ...base, options: DEFAULT_OPTIONS }))
  assert.equal(cellAfter(follow, "X1", "2026-11", "fee"), 50_000)
  assert.equal(cellAfter(follow, "X1", "2026-12", "fee"), 0)
  const keep = ok(planBillingRevision({ ...base, options: { ...DEFAULT_OPTIONS, feeMode: "keep" } }))
  assert.equal(cellAfter(keep, "X1", "2026-11", "fee"), 25_000)
  assert.equal(keep.afterCells[0]!.feeChanged, false)
})

test("fixed header fee warns", () => {
  const r = ok(
    planBillingRevision({
      lines: linesFromRows(PENFOLD022_V3),
      locks: [],
      currentMonth: "2026-10",
      campaignMonths: PENFOLD022_CAMPAIGN,
      hasFixedHeaderFee: true,
      request: { mode: "pull_month", fromMonth: "2026-12", intoMonth: "2026-11" },
      options: DEFAULT_OPTIONS,
    }),
  )
  assert.ok(r.warnings.some((w) => w.code === "FIXED_FEE_NOT_MOVED"))
})

test("AA lines keep months in a sent pack", () => {
  const r = ok(
    planBillingRevision({
      lines: linesFromRows(PENFOLD022_V3, ["penfold022SM1"]),
      locks: [],
      aaLockedMonths: ["2026-11"],
      currentMonth: "2026-10",
      campaignMonths: PENFOLD022_CAMPAIGN,
      request: { mode: "pull_month", fromMonth: "2026-12", intoMonth: "2026-11" },
      options: DEFAULT_OPTIONS,
    }),
  )
  assert.equal(r.afterCells.find((c) => c.lineItemId === "penfold022SM1"), undefined)
  assert.ok(r.warnings.some((w) => w.code === "AA_LINE_LOCKED" && w.lineItemId === "penfold022SM1"))
})

test("restore undoes E1, and refuses months locked since", () => {
  const e1 = ok(buxton({ mode: "bill_remainder", intoMonth: "2026-10" }, ["2026-10"]))
  const baseLines = linesFromRows(BUXTON004_V10)
  const revised = baseLines.map((l) => {
    const a = e1.afterCells.find((c) => c.lineItemId === l.lineItemId)
    return a ? { ...l, media: { ...a.media }, fee: { ...a.fee } } : l
  })
  const target = {
    media: Object.fromEntries(
      e1.afterCells.map((c) => {
        const base = baseLines.find((l) => l.lineItemId === c.lineItemId)!
        const full: Record<string, number> = {}
        for (const m of new Set([...Object.keys(base.media), ...Object.keys(c.media)])) full[m] = base.media[m] ?? 0
        return [c.lineItemId, full]
      }),
    ),
  }
  const undo = ok(
    planBillingRevision({
      lines: revised,
      locks: buxtonLocks(),
      currentMonth: "2026-10",
      campaignMonths: BUXTON_CAMPAIGN,
      request: { mode: "restore", target },
      options: { ...DEFAULT_OPTIONS, unlockApprovedMonths: ["2026-10"] },
    }),
  )
  assert.equal(cellAfter(undo, "buxton004DD1", "2026-10"), 522_282)
  assert.equal(cellAfter(undo, "buxton004DD1", "2026-11"), 505_435)

  const lockedSince = buxtonLocks().map((l) =>
    l.month === "2026-10" ? { ...l, level: "hard" as const, reasons: ["sent_to_accounts" as const] } : l,
  )
  const refused = planBillingRevision({
    lines: revised,
    locks: lockedSince,
    currentMonth: "2026-10",
    campaignMonths: BUXTON_CAMPAIGN,
    request: { mode: "restore", target },
    options: DEFAULT_OPTIONS,
  })
  assert.equal(!refused.ok && refused.code, "NO_CHANGE")
  assert.deepEqual(!refused.ok && refused.cannotUndo?.map((c) => c.months), [["2026-10"], ["2026-10"]])
})

test("restore to the same values is NO_CHANGE", () => {
  const lines = linesFromRows(PENFOLD022_V3)
  const r = planBillingRevision({
    lines,
    locks: [],
    currentMonth: "2026-10",
    campaignMonths: PENFOLD022_CAMPAIGN,
    request: { mode: "restore", target: { media: { penfold022SM1: { ...lines[4]!.media } } } },
    options: DEFAULT_OPTIONS,
  })
  assert.equal(!r.ok && r.code, "NO_CHANGE")
})

test("hash is stable and changes with locks", () => {
  const a = ok(penfold022({ mode: "pull_month", fromMonth: "2026-12", intoMonth: "2026-11" }))
  const b = ok(penfold022({ mode: "pull_month", fromMonth: "2026-12", intoMonth: "2026-11" }))
  assert.equal(a.hash, b.hash)
  const c = ok(
    planBillingRevision({
      lines: linesFromRows(PENFOLD022_V3),
      locks: [{ month: "2027-02", level: "soft", reasons: ["approved"], past: false }],
      currentMonth: "2026-10",
      campaignMonths: PENFOLD022_CAMPAIGN,
      request: { mode: "pull_month", fromMonth: "2026-12", intoMonth: "2026-11" },
      options: DEFAULT_OPTIONS,
    }),
  )
  assert.notEqual(a.hash, c.hash)
})
