/**
 * S2 A (B56): which months are invoiced, what a new version changes in them,
 * the one decision every publish path calls, and the `keep` splice.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { applyRevisionToBillingBlob } from "@/lib/finance/revisions/applyRevisionToBillingBlob"
import { planBillingRevision } from "@/lib/finance/revisions/planBillingRevision"
import type { LockFinanceRecord } from "@/lib/finance/revisions/resolveMonthLocks"
import { penfold022V3Blob } from "@/lib/finance/revisions/__tests__/blobFixtures"
import { DEFAULT_OPTIONS, PENFOLD022_CAMPAIGN, PENFOLD022_V3, linesFromRows } from "@/lib/finance/revisions/__tests__/fixtures"
import type { BillingMonth } from "@/lib/billing/types"
import { explodeScheduleToMonthRows, type ScheduleMonthInsert } from "@/scripts/migration/_scheduleTransform"

import {
  billingCellsOf,
  checkBilledMonths,
  invoicedMonths,
  invoicedMonthsFromLocks,
  spliceBilledMonths,
  type BillingCell,
} from "../billedMonths"
import { billedMonthSummary, CREDIT_UNAVAILABLE_REASON, decideBilledMonths, type BilledMonthsCheck } from "../choice"

const rec = (over: Partial<LockFinanceRecord>): LockFinanceRecord => ({
  invoiceKey: null,
  mbaNumber: null,
  billingMonth: null,
  approvedAt: null,
  exportedAt: null,
  matchedXeroInvoiceId: null,
  billed: null,
  billedAt: null,
  xeroStatus: null,
  ...over,
})

const inv = (records: LockFinanceRecord[], periods: Array<{ month: string; status: string }> = [], enforced = false) =>
  invoicedMonths({ mbaNumber: "Test001", records, periods, financePeriodsLockEnforced: enforced })

test("invoiced: sent, matched, billed and a Xero row count; approved and not sent does not", () => {
  const got = inv([
    rec({ invoiceKey: "media:TEST001:2026-07", exportedAt: "2026-08-01" }),
    rec({ invoiceKey: "media:test001:2026-08", matchedXeroInvoiceId: "x1", approvedAt: "2026-08-30" }),
    rec({ invoiceKey: "media:test001:2026-09", billed: true }),
    rec({ invoiceKey: "media:test001:2026-10", billedAt: "2026-10-31" }),
    rec({ invoiceKey: "xero:abc", mbaNumber: "TEST001", billingMonth: "2026-11" }),
    rec({ invoiceKey: "media:test001:2026-12", approvedAt: "2026-12-01" }),
  ])
  assert.deepEqual(
    got.map((m) => [m.month, m.reasons]),
    [
      ["2026-07", ["sent_to_accounts"]],
      ["2026-08", ["xero_matched"]],
      ["2026-09", ["legacy_billed"]],
      ["2026-10", ["legacy_billed"]],
      ["2026-11", ["xero_outside_av"]],
    ],
  )
})

test("invoiced: a voided or deleted Xero invoice does not count, as in the S2 SELECT (B56fix R6)", () => {
  assert.deepEqual(
    inv([
      rec({ invoiceKey: "xero:v1", mbaNumber: "TEST001", billingMonth: "2026-07", xeroStatus: "VOIDED" }),
      rec({ invoiceKey: "xero:d1", mbaNumber: "TEST001", billingMonth: "2026-08", xeroStatus: "deleted" }),
      rec({ invoiceKey: "xero:p1", mbaNumber: "TEST001", billingMonth: "2026-09", xeroStatus: "PAID" }),
      rec({ invoiceKey: "media:test001:2026-10", matchedXeroInvoiceId: "v2", xeroStatus: "VOIDED" }),
      rec({ invoiceKey: "media:test001:2026-11", matchedXeroInvoiceId: "v3", exportedAt: "2026-11-30", xeroStatus: "VOIDED" }),
      rec({ invoiceKey: "media:test001:2026-12", matchedXeroInvoiceId: "a1", xeroStatus: "AUTHORISED" }),
      rec({ invoiceKey: "xero:n1", mbaNumber: "TEST001", billingMonth: "2027-01", xeroStatus: null }),
    ]).map((m) => [m.month, m.reasons]),
    [
      ["2026-09", ["xero_outside_av"]],
      ["2026-11", ["sent_to_accounts"]],
      ["2026-12", ["xero_matched"]],
      ["2027-01", ["xero_outside_av"]],
    ],
  )
})

test("invoiced: other plans' records and keys are ignored", () => {
  assert.deepEqual(
    inv([
      rec({ invoiceKey: "media:test0010:2026-07", exportedAt: "2026-08-01" }),
      rec({ invoiceKey: "xero:abc", mbaNumber: "other001", billingMonth: "2026-07" }),
      rec({ invoiceKey: "sow:test001:2026-07", exportedAt: "2026-08-01" }),
    ]),
    [],
  )
})

test("invoiced: a closed finance period counts only with FINANCE_PERIODS on", () => {
  const periods = [{ month: "2026-06-01", status: "invoiced" }, { month: "2026-05-01", status: "open" }]
  assert.deepEqual(inv([], periods, false), [])
  assert.deepEqual(inv([], periods, true), [{ month: "2026-06", reasons: ["finance_period_locked"] }])
})

test("invoiced from locks keeps only the invoiced reasons", () => {
  assert.deepEqual(
    invoicedMonthsFromLocks([
      { month: "2026-09", reasons: ["past_month", "approved"] },
      { month: "2026-08", reasons: ["past_month", "aa_pack_sent", "xero_matched"] },
      { month: "2027-01", reasons: ["after_campaign"] },
    ]),
    [{ month: "2026-08", reasons: ["xero_matched"] }],
  )
})

const cell = (lineItemId: string, month: string, amountCents: number, component = "media"): BillingCell => ({
  lineItemId,
  component,
  month,
  amountCents,
})
const SEP = [{ month: "2026-09", reasons: ["xero_matched" as const] }]

test("check: the same cells are not a change", () => {
  const base = [cell("t1SM1", "2026-09-01", 1000), cell("t1SM1", "2026-10-01", 500)]
  const r = checkBilledMonths({ invoiced: SEP, base, candidate: [cell("t1SM1", "2026-09", 1000), cell("t1SM1", "2026-10", 999)] })
  assert.deepEqual(r.changedMonths, [])
  assert.equal(r.months[0]!.changed, false)
  assert.equal(r.months[0]!.deltaCents, 0)
})

test("check: a changed amount in an invoiced month is a change with the delta", () => {
  const r = checkBilledMonths({ invoiced: SEP, base: [cell("t1SM1", "2026-09", 1000)], candidate: [cell("t1SM1", "2026-09", 800)] })
  assert.deepEqual(r.changedMonths, ["2026-09"])
  assert.deepEqual(r.months[0], {
    month: "2026-09",
    reasons: ["xero_matched"],
    baseCents: 1000,
    candidateCents: 800,
    deltaCents: -200,
    changed: true,
    lines: [{ lineItemId: "t1SM1", component: "media", baseCents: 1000, candidateCents: 800 }],
  })
  assert.equal(billedMonthSummary(r.months[0]!), "Sep 2026: $10.00 billed, this version $8.00")
})

test("check: money moved between lines with the same total is still a change", () => {
  const r = checkBilledMonths({
    invoiced: SEP,
    base: [cell("t1SM1", "2026-09", 1000), cell("t1SM2", "2026-09", 0)],
    candidate: [cell("t1SM1", "2026-09", 400), cell("t1SM2", "2026-09", 600)],
  })
  assert.deepEqual(r.changedMonths, ["2026-09"])
  assert.equal(r.months[0]!.deltaCents, 0)
  assert.equal(billedMonthSummary(r.months[0]!), "Sep 2026: same total, lines differ")
})

test("check: a decorated line id is the same line; a fee or a new line is a change", () => {
  const base = [cell("billing-socialMedia::t1SM1", "2026-09", 1000)]
  assert.deepEqual(checkBilledMonths({ invoiced: SEP, base, candidate: [cell("t1SM1", "2026-09", 1000)] }).changedMonths, [])
  assert.deepEqual(
    checkBilledMonths({ invoiced: SEP, base, candidate: [cell("t1SM1", "2026-09", 1000), cell("t1SM1", "2026-09", 50, "fee")] })
      .changedMonths,
    ["2026-09"],
  )
  assert.deepEqual(
    checkBilledMonths({ invoiced: SEP, base, candidate: [cell("t1SM1", "2026-09", 1000), cell("t1SM9", "2026-09", 1)] })
      .changedMonths,
    ["2026-09"],
  )
})

test("check: a version that drops an invoiced month's billing changes it", () => {
  const r = checkBilledMonths({ invoiced: SEP, base: [cell("t1SM1", "2026-09", 1000)], candidate: [cell("t1SM1", "2026-10", 1000)] })
  assert.deepEqual(r.changedMonths, ["2026-09"])
  assert.equal(r.months[0]!.candidateCents, 0)
})

const changed: BilledMonthsCheck = checkBilledMonths({
  invoiced: SEP,
  base: [cell("t1SM1", "2026-09", 1000)],
  candidate: [cell("t1SM1", "2026-09", 800)],
})
const unchanged: BilledMonthsCheck = checkBilledMonths({ invoiced: SEP, base: [], candidate: [] })

test("decide: off, or nothing invoiced changes, goes on whatever the choice", () => {
  for (const choice of [null, "keep", "credit"] as const) {
    assert.deepEqual(decideBilledMonths({ on: false, check: changed, choice, choiceAllowed: true }), { kind: "go" })
    assert.deepEqual(decideBilledMonths({ on: true, check: unchanged, choice, choiceAllowed: true }), { kind: "go" })
  }
})

test("decide: on with a change and no choice asks for one", () => {
  const d = decideBilledMonths({ on: true, check: changed, choice: undefined, choiceAllowed: true })
  assert.equal(d.kind, "refuse")
  assert.ok(d.kind === "refuse" && d.code === "BILLED_MONTHS_CHOICE_REQUIRED")
  assert.ok(d.kind === "refuse" && /Sep 2026/.test(d.message) && /keep the billed rows/.test(d.message))
  assert.ok(d.kind === "refuse" && d.billedMonths.length === 1)
})

test("decide: a line-only change with the same month total still asks (B56fix R8, N7)", () => {
  const lineOnly = checkBilledMonths({
    invoiced: SEP,
    base: [cell("t1SM1", "2026-09", 1000), cell("t1SM2", "2026-09", 0)],
    candidate: [cell("t1SM1", "2026-09", 400), cell("t1SM2", "2026-09", 600)],
  })
  assert.equal(lineOnly.months[0]!.deltaCents, 0)
  const d = decideBilledMonths({ on: true, check: lineOnly, choice: null, choiceAllowed: true })
  assert.ok(d.kind === "refuse" && d.code === "BILLED_MONTHS_CHOICE_REQUIRED")
  assert.ok(d.kind === "refuse" && d.billedMonths.map((m) => m.month).join() === "2026-09")
  const stamp = decideBilledMonths({ on: true, check: lineOnly, choice: null, choiceAllowed: false })
  assert.ok(stamp.kind === "refuse" && stamp.code === "BILLED_MONTHS_CHANGED")
})

test("decide: keep keeps the changed months; credit is refused with the S11 reason", () => {
  assert.deepEqual(decideBilledMonths({ on: true, check: changed, choice: "keep", choiceAllowed: true }), {
    kind: "keep",
    months: ["2026-09"],
  })
  const c = decideBilledMonths({ on: true, check: changed, choice: "credit", choiceAllowed: true })
  assert.ok(c.kind === "refuse" && c.code === "BILLED_MONTHS_CREDIT_UNAVAILABLE")
  assert.ok(c.kind === "refuse" && c.message.includes(CREDIT_UNAVAILABLE_REASON))
})

test("decide: a path that cannot keep refuses a change even with keep", () => {
  const d = decideBilledMonths({ on: true, check: changed, choice: "keep", choiceAllowed: false })
  assert.ok(d.kind === "refuse" && d.code === "BILLED_MONTHS_CHANGED")
})

// Splice: penfold022 v3 as the published tip; the new version pulls Dec into Nov.
function candidateBlob(): BillingMonth[] {
  const plan = planBillingRevision({
    lines: linesFromRows(PENFOLD022_V3),
    locks: [],
    currentMonth: "2026-10",
    campaignMonths: PENFOLD022_CAMPAIGN,
    request: { mode: "pull_month", fromMonth: "2026-12", intoMonth: "2026-11" },
    options: DEFAULT_OPTIONS,
  })
  assert.ok(plan.ok)
  const res = applyRevisionToBillingBlob(penfold022V3Blob(), plan.afterCells)
  assert.ok(res.ok)
  return res.blob as BillingMonth[]
}

function rowsOf(blob: unknown, versionId: number): ScheduleMonthInsert[] {
  const out = explodeScheduleToMonthRows(versionId, "billing", blob)
  assert.equal(out.failureReason, null)
  return out.rows
}

const monthCells = (cells: readonly BillingCell[], month: string) =>
  cells
    .filter((c) => String(c.month).startsWith(month) && c.amountCents !== 0)
    .map((c) => `${c.lineItemId}|${c.component}|${c.amountCents}`)
    .sort()

test("splice: kept months bill the tip exactly, other months the new version; delivery rows stay", () => {
  const base = penfold022V3Blob()
  const candidate = candidateBlob()
  const delivery: ScheduleMonthInsert = {
    versionId: 7,
    lineItemId: "penfold022SM1",
    component: "media",
    basis: "delivery",
    month: "2026-12-01",
    amountCents: 348214,
    source: "computed",
  }
  const baseRows = rowsOf(base, 3).map((r) =>
    r.lineItemId === "penfold022SM1" && r.month.startsWith("2026-11") ? { ...r, source: "override" as const } : r,
  )
  const out = spliceBilledMonths({
    months: ["2026-11"],
    candidateSchedule: candidate,
    candidateRows: [...rowsOf(candidate, 7), delivery],
    baseSchedule: base,
    baseRows,
    versionId: 7,
  })
  assert.ok(out.ok)
  const spliced = billingCellsOf(out.schedule)!
  assert.deepEqual(monthCells(spliced, "2026-11"), monthCells(billingCellsOf(base)!, "2026-11"))
  assert.deepEqual(monthCells(spliced, "2026-12"), monthCells(billingCellsOf(candidate)!, "2026-12"))
  assert.notDeepEqual(monthCells(billingCellsOf(base)!, "2026-12"), monthCells(billingCellsOf(candidate)!, "2026-12"))

  const billing = out.rows.filter((r) => r.basis === "billing")
  assert.deepEqual(monthCells(billing, "2026-11"), monthCells(baseRows, "2026-11"))
  assert.deepEqual(monthCells(billing, "2026-12"), monthCells(rowsOf(candidate, 7), "2026-12"))
  assert.ok(billing.every((r) => r.versionId === 7))
  assert.equal(billing.find((r) => r.lineItemId === "penfold022SM1" && r.month === "2026-11-01")?.source, "override")
  assert.deepEqual(out.rows.filter((r) => r.basis === "delivery"), [delivery])
})

test("splice: an unreadable published blob refuses and names the months", () => {
  const candidate = candidateBlob()
  const out = spliceBilledMonths({
    months: ["2026-11"],
    candidateSchedule: candidate,
    candidateRows: rowsOf(candidate, 7),
    baseSchedule: [{ nonsense: true }],
    baseRows: [],
    versionId: 7,
  })
  assert.equal(out.ok, false)
  assert.ok(!out.ok && /Nov 2026/.test(out.message))
})

test("splice: two stored rows on one line, component and month refuse instead of a unique violation (B56fix R4)", () => {
  const base = penfold022V3Blob()
  const candidate = candidateBlob()
  const baseRows = rowsOf(base, 3)
  const dup = baseRows.find((r) => r.month.startsWith("2026-11"))!
  const ok = spliceBilledMonths({
    months: ["2026-11"],
    candidateSchedule: candidate,
    candidateRows: rowsOf(candidate, 7),
    baseSchedule: base,
    baseRows,
    versionId: 7,
  })
  assert.ok(ok.ok)
  const out = spliceBilledMonths({
    months: ["2026-11"],
    candidateSchedule: candidate,
    candidateRows: rowsOf(candidate, 7),
    baseSchedule: base,
    baseRows: [...baseRows, { ...dup }],
    versionId: 7,
  })
  assert.equal(out.ok, false)
  assert.ok(!out.ok && /Nov 2026/.test(out.message))
})
