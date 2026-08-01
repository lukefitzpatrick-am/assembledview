import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

import { isFinanceSectionsEnabled } from "../../../flags/financeSections.js"
import {
  FINANCE_LEGACY_PATH_REDIRECTS,
  FINANCE_SECTION_PAGE_PATHS,
  FINANCE_SECTION_SIDEBAR_ITEMS,
  FINANCE_TAB_TO_SECTION_PATH,
  getFinanceSidebarSnapshot,
  sectionPathForFinanceTab,
} from "../nav.js"
import { getRouteByExactPath } from "../../../nav/routeManifest.js"

test("isFinanceSectionsEnabled is always true (kill-switch removed, FN7)", () => {
  const prev = process.env.NEXT_PUBLIC_FINANCE_SECTIONS
  delete process.env.NEXT_PUBLIC_FINANCE_SECTIONS
  assert.equal(isFinanceSectionsEnabled(), true)
  process.env.NEXT_PUBLIC_FINANCE_SECTIONS = "on"
  assert.equal(isFinanceSectionsEnabled(), true)
  process.env.NEXT_PUBLIC_FINANCE_SECTIONS = "off"
  assert.equal(isFinanceSectionsEnabled(), true)
  process.env.NEXT_PUBLIC_FINANCE_SECTIONS = "0"
  assert.equal(isFinanceSectionsEnabled(), true)
  if (prev === undefined) delete process.env.NEXT_PUBLIC_FINANCE_SECTIONS
  else process.env.NEXT_PUBLIC_FINANCE_SECTIONS = prev
})

test("every finance sections page path is in the route manifest as admin-gated", () => {
  for (const path of FINANCE_SECTION_PAGE_PATHS) {
    const entry = getRouteByExactPath(path)
    assert.ok(entry, `missing manifest entry for ${path}`)
    assert.ok(entry!.roles?.includes("admin"), `${path} must be admin-gated`)
  }
})

test("tab redirect map covers hub tabs + xero-queue alias (FN1)", () => {
  assert.equal(FINANCE_TAB_TO_SECTION_PATH.overview, "/finance")
  assert.equal(FINANCE_TAB_TO_SECTION_PATH.billing, "/finance/invoicing")
  assert.equal(FINANCE_TAB_TO_SECTION_PATH.payables, "/finance/costs/invoices")
  assert.equal(FINANCE_TAB_TO_SECTION_PATH.accrual, "/finance/costs/accruals")
  assert.equal(FINANCE_TAB_TO_SECTION_PATH.forecast, "/finance/forecasting")
  assert.equal(FINANCE_TAB_TO_SECTION_PATH.report, "/finance/investment")
  assert.equal(FINANCE_TAB_TO_SECTION_PATH.queue, "/finance/xero")
  assert.equal(FINANCE_TAB_TO_SECTION_PATH["xero-queue"], "/finance/xero")
  assert.equal(sectionPathForFinanceTab("billing"), "/finance/invoicing")
  assert.equal(sectionPathForFinanceTab("unknown"), null)
})

test("legacy path redirects land on sections (no ?tab= hop)", () => {
  const bySource = Object.fromEntries(
    FINANCE_LEGACY_PATH_REDIRECTS.map((r) => [r.source, r.destination])
  )
  assert.equal(bySource["/finance/receivables"], "/finance/invoicing")
  assert.equal(bySource["/finance/billing"], "/finance/invoicing")
  assert.equal(bySource["/finance/publishers"], "/finance/costs/invoices")
  assert.equal(bySource["/finance/accrual"], "/finance/costs/accruals")
  assert.equal(bySource["/finance/forecast"], "/finance/forecasting")
})

test("sidebar snapshot is always expandable (FN7)", () => {
  const snap = getFinanceSidebarSnapshot()
  assert.deepEqual(snap, {
    mode: "expandable",
    label: "Finance",
    landingPath: "/finance",
    items: [
      { path: "/finance/invoicing", label: "Invoicing" },
      { path: "/finance/costs", label: "Costs" },
      { path: "/finance/investment", label: "Investment" },
      { path: "/finance/forecasting", label: "Forecasting" },
    ],
  })
  assert.equal(FINANCE_SECTION_SIDEBAR_ITEMS.length, 4)
  assert.equal(getFinanceSidebarSnapshot(false).mode, "expandable")
})

test("next.config permanent redirects cover FN1 legacy paths + tab query map", () => {
  const cfg = readFileSync(join(process.cwd(), "next.config.mjs"), "utf8")
  for (const { source, destination } of FINANCE_LEGACY_PATH_REDIRECTS) {
    assert.match(
      cfg,
      new RegExp(
        `source:\\s*"${source.replace(/\//g, "\\/")}"[\\s\\S]*?destination:\\s*"${destination.replace(/\//g, "\\/")}"`
      ),
      `next.config missing path redirect ${source} → ${destination}`
    )
  }
  for (const [tab, dest] of Object.entries(FINANCE_TAB_TO_SECTION_PATH)) {
    if (tab === "xero-queue") {
      assert.match(cfg, /value:\s*"xero-queue"/)
      assert.match(cfg, /destination:\s*"\/finance\/xero"/)
      continue
    }
    assert.match(
      cfg,
      new RegExp(`value:\\s*"${tab}"[\\s\\S]{0,200}?destination:\\s*"${dest.replace(/\//g, "\\/")}"`),
      `next.config missing tab=${tab} → ${dest}`
    )
  }
})
