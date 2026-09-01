/**
 * T0-4 — in-section finance links carry the currently applied scope.
 */
import assert from "node:assert/strict"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

import type { FinanceScopeValues } from "../defaultScope.js"
import { parseScopeFromParams, scopesEqual } from "../scopeUrl.js"
import { financeHref } from "../financeHref.js"
import { useFinanceScopeStore } from "../useFinanceScope.js"

const NON_DEFAULT: FinanceScopeValues = {
  fy: 2024,
  monthRange: { from: "2024-07", to: "2024-09" },
  clients: [12, 34, 56],
  basisDefault: "billed",
}

function paramsOf(href: string): URLSearchParams {
  return new URL(href, "http://local").searchParams
}

test("financeHref appends every non-default scope key and omits empties", () => {
  const href = financeHref("/finance/costs", NON_DEFAULT)
  assert.ok(href.startsWith("/finance/costs?"))
  const q = paramsOf(href)
  assert.equal(q.get("fy"), "2024")
  assert.equal(q.get("from"), "2024-07")
  assert.equal(q.get("to"), "2024-09")
  assert.equal(q.get("clients"), "12,34,56")
  assert.equal(q.get("basis"), "billed")

  const emptyClients: FinanceScopeValues = {
    ...NON_DEFAULT,
    clients: [],
    basisDefault: "booked",
  }
  const q2 = paramsOf(financeHref("/finance/costs", emptyClients))
  assert.equal(q2.get("fy"), "2024")
  assert.equal(q2.get("from"), "2024-07")
  assert.equal(q2.get("to"), "2024-09")
  assert.equal(q2.get("clients"), null)
  assert.equal(q2.get("basis"), null)
})

test("financeHref reads currently applied scope when the second arg is omitted", () => {
  useFinanceScopeStore.setState({
    applied: NON_DEFAULT,
    draft: NON_DEFAULT,
  })
  const href = financeHref("/finance/invoicing")
  const q = paramsOf(href)
  assert.equal(q.get("fy"), "2024")
  assert.equal(q.get("clients"), "12,34,56")
  assert.equal(q.get("basis"), "billed")
})

test("a rendered sub-nav link carries the applied scope", () => {
  const href = financeHref("/finance/costs/invoices", NON_DEFAULT)
  const html = renderToStaticMarkup(
    createElement("a", { href }, "Publisher invoices")
  )
  assert.match(html, /Publisher invoices/)
  assert.match(html, /fy=2024/)
  assert.match(html, /from=2024-07/)
  assert.match(html, /to=2024-09/)
  assert.match(html, /clients=12%2C34%2C56|clients=12,34,56/)
})

test("round trip: apply a non-default scope, follow a link, hydrate to the same values", () => {
  useFinanceScopeStore.setState({
    applied: NON_DEFAULT,
    draft: NON_DEFAULT,
    scopeVersion: 1,
  })
  const href = financeHref("/finance/costs/accruals")
  const parsed = parseScopeFromParams(paramsOf(href), new Date(2026, 0, 15))
  assert.ok(scopesEqual(parsed, NON_DEFAULT), "link serialisation must match applied")

  useFinanceScopeStore.getState().hydrateFromUrl(paramsOf(href))
  assert.ok(
    scopesEqual(useFinanceScopeStore.getState().applied, NON_DEFAULT),
    "scope bar hydrate-from-URL must restore the same values"
  )
  assert.ok(scopesEqual(useFinanceScopeStore.getState().draft, NON_DEFAULT))
})

test("Apply on a clean scope still bumps scopeVersion so data refetches", () => {
  useFinanceScopeStore.setState({
    applied: NON_DEFAULT,
    draft: { ...NON_DEFAULT, clients: [...NON_DEFAULT.clients] },
    scopeVersion: 4,
  })
  assert.equal(useFinanceScopeStore.getState().isDirty(), false)
  useFinanceScopeStore.getState().apply()
  assert.equal(useFinanceScopeStore.getState().scopeVersion, 5)
  assert.ok(scopesEqual(useFinanceScopeStore.getState().applied, NON_DEFAULT))
})

test("in-section nav sources call financeHref (not a bare path)", () => {
  const root = process.cwd()
  const files = [
    "components/finance/sections/FinanceSectionsShell.tsx",
    "components/finance/sections/costs/CostsSubNav.tsx",
    "components/finance/sections/xero/XeroSubNav.tsx",
    "components/finance/sections/costs/CostsInvoicesClient.tsx",
    "components/finance/sections/costs/CostsOverviewClient.tsx",
    "components/AppSidebar.tsx",
  ]
  for (const rel of files) {
    const src = readFileSync(join(root, rel), "utf8")
    assert.match(src, /financeHref\(/, `${rel} must use financeHref`)
  }
})
