import assert from "node:assert/strict"
import test from "node:test"

import {
  currentSydneyMonth,
  resolveMonthLocks,
  revisionMonthSpan,
  toMonthKey,
  type LockFinanceRecord,
} from "../resolveMonthLocks"

const rec = (over: Partial<LockFinanceRecord>): LockFinanceRecord => ({
  invoiceKey: null,
  mbaNumber: null,
  billingMonth: null,
  approvedAt: null,
  exportedAt: null,
  matchedXeroInvoiceId: null,
  billed: null,
  billedAt: null,
  ...over,
})

const NOW = new Date("2026-10-26T06:00:00Z")
const MONTHS = ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]

function lockOf(r: ReturnType<typeof resolveMonthLocks>, m: string) {
  return r.locks.find((l) => l.month === m)!
}

test("buxton004 on 26 Oct: xero rows hard, Sep and Oct soft, Nov open", () => {
  const records: LockFinanceRecord[] = [
    rec({ invoiceKey: "media:buxton004:2026-09", mbaNumber: "buxton004", billingMonth: "2026-09", approvedAt: "2026-09-28T23:03:42Z" }),
    rec({ invoiceKey: "media:buxton004:2026-10", mbaNumber: "buxton004", billingMonth: "2026-10", approvedAt: "2026-10-26T05:09:10Z" }),
    ...["2026-03", "2026-04", "2026-05", "2026-06"].map((m) =>
      rec({ invoiceKey: `xero:${m}`, mbaNumber: "buxton004", billingMonth: m, exportedAt: "1970-01-01T00:00:00Z", billed: true, billedAt: `${m}-28T00:00:00Z` }),
    ),
  ]
  const r = resolveMonthLocks({
    mbaNumber: "buxton004",
    months: MONTHS,
    records,
    sentAaPackMonths: [],
    periods: [],
    financePeriodsLockEnforced: false,
    lastCampaignMonth: "2026-12",
    now: NOW,
  })
  assert.equal(r.currentMonth, "2026-10")
  assert.equal(lockOf(r, "2026-03").level, "hard")
  assert.ok(lockOf(r, "2026-03").reasons.includes("xero_outside_av"))
  assert.equal(lockOf(r, "2026-07").level, "open")
  assert.equal(lockOf(r, "2026-07").past, true)
  assert.equal(lockOf(r, "2026-09").level, "soft")
  assert.equal(lockOf(r, "2026-10").level, "soft")
  assert.equal(lockOf(r, "2026-10").past, false)
  assert.equal(lockOf(r, "2026-11").level, "open")
})

test("each hard stamp locks hard; the 1970 exported_at counts", () => {
  const months = ["2026-11"]
  const base = { mbaNumber: "X1", months, sentAaPackMonths: [], periods: [], financePeriodsLockEnforced: false, lastCampaignMonth: "2026-12", now: NOW }
  const cases: Array<[Partial<LockFinanceRecord>, string]> = [
    [{ exportedAt: "1970-01-01T00:00:00Z" }, "sent_to_accounts"],
    [{ matchedXeroInvoiceId: "abc" }, "xero_matched"],
    [{ billed: true }, "legacy_billed"],
    [{ billedAt: "2026-11-02T00:00:00Z" }, "legacy_billed"],
  ]
  for (const [over, reason] of cases) {
    const r = resolveMonthLocks({ ...base, records: [rec({ invoiceKey: "media:X1:2026-11", ...over })] })
    assert.equal(r.locks[0]!.level, "hard", reason)
    assert.ok(r.locks[0]!.reasons.includes(reason as never), reason)
  }
  const approvedThenSent = resolveMonthLocks({
    ...base,
    records: [rec({ invoiceKey: "media:X1:2026-11", approvedAt: "2026-11-01", exportedAt: "2026-11-02" })],
  })
  assert.equal(approvedThenSent.locks[0]!.level, "hard")
})

test("mixed-case invoice keys match (PENFOLD020)", () => {
  const r = resolveMonthLocks({
    mbaNumber: "penfold020",
    months: ["2026-10"],
    records: [rec({ invoiceKey: "media:PENFOLD020:2026-10", approvedAt: "2026-10-26T05:09:10Z" })],
    sentAaPackMonths: [],
    periods: [],
    financePeriodsLockEnforced: false,
    lastCampaignMonth: "2027-01",
    now: NOW,
  })
  assert.equal(r.locks[0]!.level, "soft")
})

test("another MBA's records never lock this one", () => {
  const r = resolveMonthLocks({
    mbaNumber: "buxton004",
    months: ["2026-11"],
    records: [
      rec({ invoiceKey: "media:buxton0041:2026-11", exportedAt: "2026-11-02" }),
      rec({ invoiceKey: "xero:abc", mbaNumber: "other", billingMonth: "2026-11" }),
    ],
    sentAaPackMonths: [],
    periods: [],
    financePeriodsLockEnforced: false,
    lastCampaignMonth: "2026-12",
    now: NOW,
  })
  assert.equal(r.locks[0]!.level, "open")
})

test("AA packs: months up to the last sent pack lock AA lines", () => {
  const r = resolveMonthLocks({
    mbaNumber: "X1",
    months: ["2026-10", "2026-11", "2026-12"],
    records: [],
    sentAaPackMonths: ["2026-11-01"],
    periods: [],
    financePeriodsLockEnforced: false,
    lastCampaignMonth: "2026-12",
    now: NOW,
  })
  assert.deepEqual(r.aaLockedMonths, ["2026-10", "2026-11"])
  assert.equal(r.locks.find((l) => l.month === "2026-11")!.level, "open", "month level stays open for non-AA lines")
})

test("finance periods lock only when FINANCE_PERIODS=on", () => {
  const args = {
    mbaNumber: "X1",
    months: ["2026-11"],
    records: [],
    sentAaPackMonths: [],
    periods: [{ month: "2026-11-01", status: "locked" }],
    lastCampaignMonth: "2026-12",
    now: NOW,
  }
  assert.equal(resolveMonthLocks({ ...args, financePeriodsLockEnforced: false }).locks[0]!.level, "open")
  const on = resolveMonthLocks({ ...args, financePeriodsLockEnforced: true })
  assert.equal(on.locks[0]!.level, "hard")
  assert.ok(on.locks[0]!.reasons.includes("finance_period_locked"))
  const review = resolveMonthLocks({ ...args, financePeriodsLockEnforced: true, periods: [{ month: "2026-11-01", status: "review" }] })
  assert.equal(review.locks[0]!.level, "open")
})

test("months after the campaign end are hard", () => {
  const r = resolveMonthLocks({
    mbaNumber: "X1",
    months: ["2027-01"],
    records: [],
    sentAaPackMonths: [],
    periods: [],
    financePeriodsLockEnforced: false,
    lastCampaignMonth: "2026-12",
    now: NOW,
  })
  assert.equal(r.locks[0]!.level, "hard")
  assert.deepEqual(r.locks[0]!.reasons, ["after_campaign"])
})

test("Sydney month edge: 31 Oct 23:59 AEDT vs 1 Nov 00:30 AEDT", () => {
  assert.equal(currentSydneyMonth(new Date("2026-10-31T12:59:00Z")), "2026-10")
  assert.equal(currentSydneyMonth(new Date("2026-10-31T13:30:00Z")), "2026-11")
  // UTC is still 31 Oct here, Sydney is already November.
  assert.equal(new Date("2026-10-31T13:30:00Z").getUTCMonth(), 9)
  // AEST in winter: 30 Jun 14:00 UTC = 1 Jul 00:00 AEST.
  assert.equal(currentSydneyMonth(new Date("2026-06-30T13:59:00Z")), "2026-06")
  assert.equal(currentSydneyMonth(new Date("2026-06-30T14:00:00Z")), "2026-07")
})

test("toMonthKey and revisionMonthSpan", () => {
  assert.equal(toMonthKey("September 2026"), "2026-09")
  assert.equal(toMonthKey("2026-09-01"), "2026-09")
  assert.equal(toMonthKey("rubbish"), null)
  assert.deepEqual(
    revisionMonthSpan({ campaignStartMonth: "2026-11", campaignEndMonth: "2026-12", currentMonth: "2026-10", cellMonths: [] }),
    ["2026-10", "2026-11", "2026-12"],
  )
})
