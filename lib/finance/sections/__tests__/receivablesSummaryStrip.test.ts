import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { ReceivablesSummaryStrip } from "../../../../components/finance/receivables/ReceivablesSummaryStrip.js"

test("funnel tiles loading never shows $0.00", () => {
  const html = renderToStaticMarkup(
    createElement(ReceivablesSummaryStrip, { view: "loading" })
  )
  assert.equal(html.includes("$0.00"), false)
  assert.ok(html.includes("aria-busy"))
  assert.ok(html.includes("Ready invoices in the current scope"))
  assert.ok(html.includes("Approved invoices in the current scope"))
  assert.ok(html.includes("Sent to finance and beyond in the current scope"))
  assert.equal(html.includes("Total to bill"), false)
  assert.equal(html.includes("Any derived state past ready"), false)
})

test("funnel tiles error never shows $0.00", () => {
  const html = renderToStaticMarkup(
    createElement(ReceivablesSummaryStrip, {
      view: "error",
      errorMessage: "boom",
    })
  )
  assert.equal(html.includes("$0.00"), false)
  assert.ok(html.includes("Unavailable"))
  assert.ok(html.includes("boom"))
  assert.ok(html.includes("Ready to approve"))
})

test("funnel tile labels match the lifecycle pills and carry a count sub-line", () => {
  const html = renderToStaticMarkup(
    createElement(ReceivablesSummaryStrip, {
      view: "ready",
      readyCents: 35_000,
      approvedCents: 40_000,
      sentToFinanceCents: 15_000,
      readyCaption: "2 invoices · 1 month",
      approvedCaption: "1 invoice · 1 month",
      sentToFinanceCaption: "3 invoices · 1 month",
    })
  )
  assert.ok(html.includes("Ready to approve"))
  assert.ok(html.includes("Approved"))
  assert.ok(html.includes("Sent to finance"))
  assert.ok(html.includes("2 invoices · 1 month"))
  assert.ok(html.includes("1 invoice · 1 month"))
  assert.ok(html.includes("3 invoices · 1 month"))
  assert.equal(html.includes("Total to bill"), false)
  assert.equal(html.includes("Approved &amp; beyond") || html.includes("Approved & beyond"), false)
  assert.equal(html.includes("Not yet approved"), false)
  assert.equal(html.includes("Any derived state past ready"), false)
})

test("funnel tiles are clickable lifecycle filters with an All control", () => {
  const html = renderToStaticMarkup(
    createElement(ReceivablesSummaryStrip, {
      view: "ready",
      readyCents: 100,
      approvedCents: 200,
      sentToFinanceCents: 300,
      selectedFilter: "ready",
      onFilterChange: () => undefined,
    })
  )
  assert.ok(html.includes("<button"))
  assert.ok(html.includes('aria-pressed="true"'))
  assert.ok(html.includes(">All<") || html.includes(">All invoices<") || html.includes("All"))
  assert.match(html, /aria-pressed="false"/)
})
