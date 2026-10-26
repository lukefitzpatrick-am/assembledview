import assert from "node:assert/strict"
import test from "node:test"

import { planBillingRevision } from "../planBillingRevision"
import {
  buildPreviewGrid,
  buildRequestBody,
  initialPanelForm,
  previewBlocker,
  sydneyMonthNow,
  underspendAction,
} from "../panelModel"
import { DEFAULT_OPTIONS, PENFOLD022_CAMPAIGN, PENFOLD022_V3, linesFromRows } from "./fixtures"

test("PENFOLD020 $100k form builds the preview body", () => {
  const form = { ...initialPanelForm({ currentMonth: "2026-10" }), amount: "100,000", reason: " Client asked ", unlockApprovedMonths: ["2026-10"] }
  assert.equal(previewBlocker(form), null)
  assert.deepEqual(buildRequestBody("PENFOLD020", form), {
    mbaNumber: "PENFOLD020",
    reason: "Client asked",
    unlockApprovedMonths: ["2026-10"],
    includeProduction: false,
    feeMode: "follow",
    mode: "bill_amount",
    intoMonth: "2026-10",
    amount: 100000,
    strategy: "earliest_first",
  })
})

test("blockers: reason, amount, pull source, underspend actual", () => {
  const f = initialPanelForm({ currentMonth: "2026-10" })
  assert.equal(previewBlocker(f), "Add a reason.")
  assert.equal(previewBlocker({ ...f, reason: "r" }), "Enter an amount above $0.00.")
  assert.equal(previewBlocker({ ...f, reason: "r", tab: "pull_month" }), "Pick the month to pull from.")
  assert.equal(previewBlocker({ ...f, reason: "r", tab: "underspend", underspendMonth: "2026-09" }), "Type at least one actual.")
})

test("preview grid: changed lines, skipped production, locked months flagged", () => {
  const lines = linesFromRows(PENFOLD022_V3)
  const plan = planBillingRevision({
    lines,
    locks: [],
    currentMonth: "2026-10",
    campaignMonths: PENFOLD022_CAMPAIGN,
    request: { mode: "pull_month", fromMonth: "2026-12", intoMonth: "2026-11" },
    options: DEFAULT_OPTIONS,
  })
  assert.ok(plan.ok)
  const grid = buildPreviewGrid(plan, lines)
  assert.deepEqual(grid.months.map((m) => m.month), ["2026-11", "2026-12"])
  assert.equal(grid.rows[0]!.lineItemId, "penfold022SM1")
  assert.deepEqual(grid.rows[0]!.cells["2026-11"], { before: 401_786, after: 750_000, changed: true })
  assert.equal(grid.rows.at(-1)!.skipped, "production")
  const total = grid.totals.find((t) => t.key === "total")!
  assert.equal(total.cells["2026-12"]!.after, 337_931)
})

test("Record underspend: past or current month only, not on invoiced months", () => {
  const now = new Date("2026-10-26T06:00:00Z")
  assert.equal(sydneyMonthNow(new Date("2026-10-31T13:30:00Z")), "2026-11")
  assert.deepEqual(underspendAction({ billing_month: "2026-11", state: "ready" }, now), { show: false })
  assert.deepEqual(underspendAction({ billing_month: "2026-10", state: "approved" }, now), { show: true })
  assert.equal(underspendAction({ billing_month: "2026-09", state: "sent_to_finance" }, now).show, true)
  assert.match(underspendAction({ billing_month: "2026-09", state: "paid" }, now).disabledReason ?? "", /Invoiced/)
})
