import assert from "node:assert/strict"
import test from "node:test"

import { planBillingRevision } from "../planBillingRevision"
import {
  buildRevisedBillingRows,
  diffCentsMaps,
  financeEditDrafts,
  overrideMonthsFor,
  overrideSumViolations,
  restoreTargetFrom,
  reviseApprovedSlice,
  rowCentsMap,
  type BillingRowLike,
} from "../revisionWriteModel"
import type { RevisionOk } from "../types"
import { DEFAULT_OPTIONS, PENFOLD022_CAMPAIGN, PENFOLD022_V3, linesFromRows } from "./fixtures"

const BASE_ROWS: BillingRowLike[] = PENFOLD022_V3.map(([id, , , c, m, cents]) => ({
  lineItemId: id,
  component: c === "m" ? "media" : c === "f" ? "fee" : "adserving",
  month: `${m}-01`,
  amountCents: cents,
  source: "computed",
}))

function e7(): RevisionOk {
  const r = planBillingRevision({
    lines: linesFromRows(PENFOLD022_V3),
    locks: [],
    currentMonth: "2026-10",
    campaignMonths: PENFOLD022_CAMPAIGN,
    request: { mode: "pull_month", fromMonth: "2026-12", intoMonth: "2026-11" },
    options: DEFAULT_OPTIONS,
  })
  assert.ok(r.ok)
  return r
}

test("revised rows replace only changed lines and mark them override", () => {
  const plan = e7()
  const rows = buildRevisedBillingRows(BASE_ROWS, plan.afterCells)
  const sm1 = rows.filter((r) => r.lineItemId === "penfold022SM1")
  assert.deepEqual(sm1, [
    { lineItemId: "penfold022SM1", component: "media", month: "2026-11-01", amountCents: 750_000, source: "override" },
  ])
  const prod = rows.filter((r) => r.lineItemId === "penfold022PROD1")
  assert.equal(prod.length, 2)
  assert.ok(prod.every((r) => r.source === "computed"))
  // Totals per line unchanged.
  const total = (rs: BillingRowLike[]) => rs.reduce((s, r) => s + r.amountCents, 0)
  assert.equal(total(rows), total(BASE_ROWS))
  assert.deepEqual(diffCentsMaps(rowCentsMap(rows), rowCentsMap(BASE_ROWS)).length, 8)
})

test("override months cover the line's span with zeros, in dollars, and pass the sum law", () => {
  const months = overrideMonthsFor({ "2026-11": 401_786, "2026-12": 348_214 }, { "2026-11": 750_000 })
  assert.deepEqual(months, [
    { month: "2026-11", amount: 7500 },
    { month: "2026-12", amount: 0 },
  ])
  assert.deepEqual(overrideSumViolations([{ lineItemId: "SM1", component: "media", months, expectedCents: 750_000 }]), [])
  assert.equal(
    overrideSumViolations([{ lineItemId: "SM1", component: "media", months, expectedCents: 740_000 }]).length,
    1,
  )
})

test("approved slice keeps totals and adds the new months of changed lines", () => {
  const slice = {
    totalCents: 750_000,
    lines: [{ lineItemId: "penfold022SM1", months: ["2026-11", "2026-12"], mediaCents: 750_000, feeCents: 0, adservingCents: 0, productionCents: 0 }],
  }
  const rows: BillingRowLike[] = [
    { lineItemId: "penfold022SM1", component: "media", month: "2026-10-01", amountCents: 750_000, source: "override" },
  ]
  const out = reviseApprovedSlice(slice, rows, new Set(["penfold022SM1"]))!
  assert.equal(out.totalCents, 750_000)
  assert.deepEqual(out.lines[0]!.months, ["2026-10", "2026-11", "2026-12"])
  assert.equal(reviseApprovedSlice(null, rows, new Set()), null)
})

test("finance edit drafts: one per changed month and component", () => {
  const drafts = financeEditDrafts(e7())
  assert.deepEqual(drafts, [
    { month: "2026-11", component: "media", oldCents: 2_103_570 + 362_069, newCents: 2_799_999 + 362_069 },
    { month: "2026-12", component: "media", oldCents: 696_429 + 337_931, newCents: 337_931 },
  ])
})

test("restore target holds the base cells of changed lines", () => {
  const plan = e7()
  const target = restoreTargetFrom(linesFromRows(PENFOLD022_V3), plan)
  assert.deepEqual(target.media.penfold022SM1, { "2026-11": 401_786, "2026-12": 348_214 })
  assert.equal(target.media.penfold022DD1, undefined)
  assert.deepEqual(target.fee, {})
})
