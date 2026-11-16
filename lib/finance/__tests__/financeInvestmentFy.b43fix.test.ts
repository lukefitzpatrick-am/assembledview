/**
 * B43fix (review R6): with `finance_melbourne_month` on, the investment
 * measure catalog (the picker's historic block), agency economics (the
 * historic FY gate) and the investment explorer use the same financial year
 * rule as the investment cut's default: 1 July turns the FY at Melbourne
 * midnight. Off: the host's date, exactly as before.
 *
 * 30 Jun 2026 15:00Z is 1 Jul 01:00 AEST. On a UTC host (Vercel) the switch
 * off still reads FY 2025 as current; on reads FY 2026, so FY 2025 is
 * historic and its agency economics are blocked.
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { test } from "node:test"

import { AGENCY_ECONOMICS_HISTORIC_CAPTION, AGENCY_ECONOMICS_MEASURES, validateAgencyEconomicsFy } from "../sections/investment/agencyEconomics.js"
import { measurePickerState } from "../sections/investment/measureCatalog.js"
import { normalizeInvestmentCutRequest } from "../sections/investment/cutQuery.js"
import type { InvestmentCutMeasure } from "../sections/investment/cutTypes.js"

process.env.TZ = "UTC"

const JUL_1 = new Date("2026-06-30T15:00:00Z") // 1 Jul 01:00 AEST
const MID_YEAR = new Date("2026-11-16T03:00:00Z")
const AGENCY = AGENCY_ECONOMICS_MEASURES[0] as InvestmentCutMeasure

test("agency economics FY gate: on, FY 2025 is historic at 1 Jul 01:00 AEST; off, it is still current (as before)", () => {
  const input = { fy: 2025, measures: [AGENCY], today: JUL_1 }
  assert.deepEqual(validateAgencyEconomicsFy(input), { ok: true })
  assert.deepEqual(validateAgencyEconomicsFy({ ...input, monthOpts: { melbourne: false } }), { ok: true })
  const on = validateAgencyEconomicsFy({ ...input, monthOpts: { melbourne: true } })
  assert.ok("code" in on)
  assert.equal(on.code, "AGENCY_ECONOMICS_HISTORIC_FY_BLOCKED")
  assert.equal(on.currentFy, 2026)
  // Away from 1 July, on and off agree.
  assert.deepEqual(validateAgencyEconomicsFy({ fy: 2026, measures: [AGENCY], today: MID_YEAR, monthOpts: { melbourne: true } }), { ok: true })
})

test("the investment cut passes the switch to the agency FY gate", () => {
  const request = { fy: 2025, basis: "billing" as const, dimensions: ["client" as const], measures: [AGENCY] }
  const off = normalizeInvestmentCutRequest(request, JUL_1)
  assert.ok(!("code" in off && off.code === "AGENCY_ECONOMICS_HISTORIC_FY_BLOCKED"), JSON.stringify(off))
  const on = normalizeInvestmentCutRequest(request, JUL_1, { melbourne: true })
  assert.ok("code" in on && on.code === "AGENCY_ECONOMICS_HISTORIC_FY_BLOCKED", JSON.stringify(on))
})

test("measure catalog: on, the picker blocks agency measures for FY 2025 at 1 Jul 01:00 AEST; off, it does not (as before)", () => {
  const agency = (state: ReturnType<typeof measurePickerState>) => state.find((m) => m.key === AGENCY)!
  const off = agency(measurePickerState(["client"], undefined, { fy: 2025, today: JUL_1 }))
  assert.equal(off.disabled, false)
  const offExplicit = agency(measurePickerState(["client"], undefined, { fy: 2025, today: JUL_1, melbourne: false }))
  assert.equal(offExplicit.disabled, false)
  const on = agency(measurePickerState(["client"], undefined, { fy: 2025, today: JUL_1, melbourne: true }))
  assert.equal(on.disabled, true)
  assert.equal(on.disabledReason, AGENCY_ECONOMICS_HISTORIC_CAPTION)
})

test("the explorer and the measure picker read the switch (source check; no render harness for these pages)", () => {
  const root = process.cwd()
  const explorer = fs.readFileSync(path.join(root, "components/finance/sections/investment/InvestmentExplorerClient.tsx"), "utf8")
  assert.match(explorer, /currentFinanceFyStartYear\(new Date\(\), \{ melbourne: clientFeatureOn\("finance_melbourne_month"\) \}\)/)
  assert.doesNotMatch(explorer, /australianFyStartYearForDate/)
  const picker = fs.readFileSync(path.join(root, "components/finance/sections/investment/InvestmentMeasurePicker.tsx"), "utf8")
  assert.match(picker, /\{ fy, melbourne: clientFeatureOn\("finance_melbourne_month"\) \}/)
  for (const file of ["measureCatalog.ts", "agencyEconomics.ts"]) {
    const src = fs.readFileSync(path.join(root, "lib/finance/sections/investment", file), "utf8")
    assert.doesNotMatch(src, /australianFyStartYearForDate\(/, `${file} reads the FY through currentFinanceFyStartYear`)
  }
})
