/**
 * B59 (C-277, S9 A): the plan form's billing schedule download (create and
 * edit pages, in the browser) is stamped with the Melbourne day, not the
 * viewer's day. The file runs in both zones: Melbourne, then UTC, which
 * stands in for a viewer outside Melbourne (a host-day revert passes in
 * Melbourne and fails there). The clock is mocked where the UTC day is the
 * day before:
 *   - 30 Nov 2026 21:00Z, 1 Dec 08:00 AEDT;
 *   - 30 Jun 2026 21:00Z, 1 Jul 07:00 AEST.
 */
import "@/lib/testing/bothZones"
import assert from "node:assert/strict"
import test from "node:test"

import { billingScheduleFileStem } from "@/lib/billing/exportBillingScheduleExcel"

const INSTANTS = [
  { at: "2026-11-30T21:00:00Z", stamp: "20261201", label: "1 Dec 08:00 AEDT" },
  { at: "2026-06-30T21:00:00Z", stamp: "20260701", label: "1 Jul 07:00 AEST" },
] as const

for (const { at, stamp, label } of INSTANTS) {
  test(`billing schedule file name carries the Melbourne day (${label})`, (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.parse(at) })
    assert.equal(billingScheduleFileStem("Acme: Co", "ACME001"), `BillingSchedule_Acme- Co_ACME001_${stamp}`)
    assert.equal(billingScheduleFileStem("", "Draft"), `BillingSchedule_Plan_Draft_${stamp}`)
  })
}
