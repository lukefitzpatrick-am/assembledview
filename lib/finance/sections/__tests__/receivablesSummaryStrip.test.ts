import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { ReceivablesSummaryStrip } from "../../../../components/finance/receivables/ReceivablesSummaryStrip.js"

test("summary strip loading never shows $0.00", () => {
  const html = renderToStaticMarkup(
    createElement(ReceivablesSummaryStrip, { view: "loading" })
  )
  assert.equal(html.includes("$0.00"), false)
  assert.ok(html.includes("aria-busy"))
  assert.ok(html.includes("Any derived state past ready"))
  assert.ok(html.includes("Derived state still ready"))
})

test("summary strip error never shows $0.00", () => {
  const html = renderToStaticMarkup(
    createElement(ReceivablesSummaryStrip, {
      view: "error",
      errorMessage: "boom",
    })
  )
  assert.equal(html.includes("$0.00"), false)
  assert.ok(html.includes("Unavailable"))
  assert.ok(html.includes("boom"))
})

test("summary strip labels match hasBillingEvidence, not billed", () => {
  const html = renderToStaticMarkup(
    createElement(ReceivablesSummaryStrip, {
      view: "ready",
      totalToBillCents: 10_000,
      approvedAndBeyondCents: 4_000,
      notYetApprovedCents: 6_000,
    })
  )
  assert.ok(html.includes("Approved &amp; beyond") || html.includes("Approved & beyond"))
  assert.ok(html.includes("Not yet approved"))
  assert.equal(html.includes(">Billed<"), false)
  assert.equal(html.includes(">Outstanding<"), false)
  assert.ok(html.includes("Any derived state past ready"))
  assert.ok(html.includes("Derived state still ready"))
})
