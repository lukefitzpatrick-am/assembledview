import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

import { isFinanceSectionsEnabled } from "../../../flags/financeSections.js"
import {
  CLIENTS_BILLING_TAB_ITEMS,
  FINANCE_LEGACY_PATH_REDIRECTS,
  FINANCE_SECTION_PAGE_PATHS,
  FINANCE_SECTION_SIDEBAR_ITEMS,
  FINANCE_TAB_TO_SECTION_PATH,
  financeSectionPillsForPath,
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

test("tab redirect map covers hub tabs + xero-queue alias (FN1 / FIN-1)", () => {
  assert.equal(FINANCE_TAB_TO_SECTION_PATH.overview, "/finance/invoicing")
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
  assert.equal(bySource["/finance/home"], "/finance/invoicing")
  assert.equal(bySource["/finance/publishers"], "/finance/costs/invoices")
  assert.equal(bySource["/finance/accrual"], "/finance/costs/accruals")
  assert.equal(bySource["/finance/forecast"], "/finance/forecasting")
})

test("sidebar snapshot is FIN-1 four-item Finance group", () => {
  const snap = getFinanceSidebarSnapshot()
  assert.deepEqual(snap, {
    mode: "expandable",
    label: "Finance",
    landingPath: "/finance/invoicing",
    items: [
      { path: "/finance/invoicing", label: "Clients billing" },
      { path: "/finance/costs", label: "Publishers" },
      { path: "/finance/forecasting", label: "Forecasting" },
      { path: "/finance/investment", label: "Investment" },
    ],
  })
  assert.equal(FINANCE_SECTION_SIDEBAR_ITEMS.length, 4)
  assert.equal(getFinanceSidebarSnapshot(false).mode, "expandable")
})

test("Clients billing tabs; Forecasting/Investment/Publishers have no shell pills", () => {
  assert.deepEqual(
    CLIENTS_BILLING_TAB_ITEMS.map((i) => i.label),
    ["Invoicing", "Owed", "Periods", "Xero"]
  )
  assert.equal(financeSectionPillsForPath("/finance/invoicing").length, 4)
  assert.equal(financeSectionPillsForPath("/finance/owed").length, 4)
  assert.equal(financeSectionPillsForPath("/finance/periods").length, 4)
  assert.equal(financeSectionPillsForPath("/finance/xero/matches").length, 4)
  assert.equal(financeSectionPillsForPath("/finance/costs").length, 0)
  assert.equal(financeSectionPillsForPath("/finance/forecasting").length, 0)
  assert.equal(financeSectionPillsForPath("/finance/investment").length, 0)
})

test("Clients billing hides Periods tab when FINANCE_PERIODS is off (FIN-8)", () => {
  const pills = financeSectionPillsForPath("/finance/invoicing", { periodsEnabled: false })
  assert.deepEqual(
    pills.map((i) => i.label),
    ["Invoicing", "Owed", "Xero"]
  )
  assert.equal(
    financeSectionPillsForPath("/finance/xero", { periodsEnabled: false }).length,
    3
  )
  assert.equal(
    financeSectionPillsForPath("/finance/invoicing", { periodsEnabled: true }).length,
    4
  )
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
  assert.match(
    cfg,
    /source:\s*"\/finance",\s*destination:\s*"\/finance\/invoicing"/,
    "next.config missing bare /finance → /finance/invoicing"
  )
})
