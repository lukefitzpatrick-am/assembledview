import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { StatTile } from "../../../../components/finance/sections/StatTile.js"

test("StatTile four states: loading never shows $0.00", () => {
  const html = renderToStaticMarkup(
    createElement(StatTile, {
      label: "Receivables",
      basisCaption: "billing · demo",
      state: { status: "loading" },
    })
  )
  assert.equal(html.includes("$0.00"), false)
  assert.equal(html.includes("Unavailable"), false)
})

test("StatTile error never shows $0.00", () => {
  const html = renderToStaticMarkup(
    createElement(StatTile, {
      label: "Receivables",
      basisCaption: "billing · demo",
      state: { status: "error", message: "boom" },
    })
  )
  assert.equal(html.includes("$0.00"), false)
  assert.ok(html.includes("Unavailable"))
  assert.ok(html.includes("boom"))
  assert.ok(html.includes("billing · demo"))
})

test("StatTile empty shows em dash not $0.00", () => {
  const html = renderToStaticMarkup(
    createElement(StatTile, {
      label: "Receivables",
      basisCaption: "billing · demo",
      state: { status: "empty" },
    })
  )
  assert.equal(html.includes("$0.00"), false)
  assert.ok(html.includes("—"))
})

test("StatTile ready true-zero shows $0.00", () => {
  const html = renderToStaticMarkup(
    createElement(StatTile, {
      label: "Receivables",
      basisCaption: "billing · demo",
      state: { status: "ready", cents: 0 },
    })
  )
  assert.ok(html.includes("$0.00") || html.includes("$0"))
  assert.ok(html.includes("billing · demo"))
})
