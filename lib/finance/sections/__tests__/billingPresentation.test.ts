import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { BillingMonthChipRow } from "../../../../components/finance/sections/invoicing/BillingMonthChips.js"
import { BillingStatCards } from "../../../../components/finance/sections/invoicing/BillingStatCards.js"
import {
  billingDifferencePill,
  billingMonthChipLabel,
  fyBillingMonthChips,
  pressedBillingMonth,
  summariseBillingStatCards,
} from "../billingPresentation.js"

test("stat cards sum loaded totals by derived state", () => {
  const cards = summariseBillingStatCards([
    { total: 100, state: "ready" },
    { total: 40, state: "drafted", needs_attention: true },
    { total: 10, state: "drafted" },
    { total: 25, state: "issued" },
    { total: 15, state: "paid" },
    { total: 8, state: "overdue" },
    { total: 3, state: "issued_outside_av" },
  ])
  assert.equal(cards.expectedCents, 20100)
  assert.equal(cards.expectedCount, 7)
  assert.equal(cards.draftedCents, 5000)
  assert.equal(cards.draftedCount, 2)
  assert.equal(cards.draftedDiffersCount, 1)
  assert.equal(cards.issuedPaidCents, 4000)
  assert.equal(cards.issuedPaidCount, 2)
  assert.equal(cards.overdueCents, 800)
  assert.equal(cards.overdueCount, 1)
})

test("overdue card uses the critical text token and a coral dot", () => {
  const html = renderToStaticMarkup(
    createElement(BillingStatCards, {
      view: "ready",
      cards: summariseBillingStatCards([{ total: 15.2, state: "overdue" }]),
    })
  )
  assert.ok(html.includes("Expected"))
  assert.ok(html.includes("Drafted in Xero"))
  assert.ok(html.includes("Issued and paid"))
  assert.ok(html.includes("Overdue"))
  assert.ok(html.includes("text-status-critical-fg"))
  assert.ok(html.includes("bg-tone-critical"))
  assert.equal(html.includes("$0.00") && html.includes("Overdue") ? html.includes("text-status-critical-fg") : true, true)
})

test("stat cards loading never shows $0.00", () => {
  const html = renderToStaticMarkup(
    createElement(BillingStatCards, {
      view: "loading",
      cards: summariseBillingStatCards([]),
    })
  )
  assert.equal(html.includes("$0.00"), false)
  assert.ok(html.includes("aria-busy"))
})

test("FY chips run July to June and the current month is pressed inside a wider range", () => {
  const months = fyBillingMonthChips(2026)
  assert.deepEqual(months[0], "2026-07")
  assert.deepEqual(months[11], "2027-06")
  assert.equal(months.length, 12)
  assert.equal(billingMonthChipLabel("2026-07"), "Jul")
  assert.equal(billingMonthChipLabel("2026-09"), "Sep")
  assert.equal(billingMonthChipLabel("2026-10"), "Oct")
  const today = new Date(2026, 9, 10)
  assert.equal(
    pressedBillingMonth({ from: "2026-07", to: "2026-10" }, 2026, today),
    "2026-10"
  )
  assert.equal(
    pressedBillingMonth({ from: "2026-08", to: "2026-08" }, 2026, today),
    "2026-08"
  )
  assert.equal(
    pressedBillingMonth({ from: "2026-07", to: "2026-08" }, 2026, today),
    null
  )
})

test("month chip row uses the lime active style", () => {
  const html = renderToStaticMarkup(
    createElement(BillingMonthChipRow, {
      months: ["2026-09", "2026-10"],
      pressed: "2026-10",
      onSelect: () => undefined,
    })
  )
  assert.ok(html.includes('aria-pressed="true"'))
  assert.ok(html.includes("bg-accent"))
  assert.ok(html.includes(">Oct<"))
  assert.ok(html.includes(">Sep<"))
})

test("difference pill only when a Xero figure exists", () => {
  assert.equal(billingDifferencePill(100, null), null)
  assert.deepEqual(billingDifferencePill(100, 100), { text: "Matches", tone: "good" })
  assert.equal(billingDifferencePill(100, 100.5)?.tone, "good")
  const gap = billingDifferencePill(100, 120)
  assert.equal(gap?.tone, "attention")
  assert.ok(gap?.text.startsWith("+"))
})
