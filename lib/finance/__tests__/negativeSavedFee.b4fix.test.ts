/**
 * B4 fix (P6, Luke 2 Nov 2026): a negative saved month fee keeps its minus
 * sign through the shared parser and the finance readers that sum it. Live:
 * 0 versions have a negative saved fee (2 Nov 2026), so no live money moves.
 *
 * Two readers still drop a fee at or below 0 (C-163, pinned here as they are
 * today, not decided): the receivable fee line (`pushFee`) and the
 * schedule_months header fee for months with line items (`_scheduleTransform`).
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { parsePersistedBillingScheduleToMonths } from "@/lib/billing/parsePersistedBillingScheduleToMonths"
import { parseSavedBillingForEditor } from "@/lib/mediaplan/parseSavedBillingForEditor"
import { explodeScheduleToMonthRows, sumScheduleCents } from "@/scripts/migration/_scheduleTransform"
import { computeCampaignFinancialsFromVersion } from "../computeCampaignFinancialsFromVersion.js"
import { derivePlanReceivableBillingRecordsForMonth } from "../deriveReceivableRecords.js"
import { monthExGstFromScheduleEntry } from "../computeBillableAlignedMbaTotal.js"
import { serviceAmountsFromBillingMonth } from "../scheduleMonthFinanceExtract.js"

const OCT = "October 2026"
/** Old Xano layout: $500 TV, a -$50 fee credit. */
const xano = [
  { monthYear: OCT, feeTotal: "-$50.00", adservingTechFees: "$0.00", production: "$0.00",
    mediaTypes: [{ mediaType: "Television", lineItems: [{ header1: "Seven", header2: "Sydney", amount: "$500.00", lineItemId: "neg001TV1" }] }] },
]
/** App layout: the same month as the editor saves it. */
const app = [
  { monthYear: OCT, mediaTotal: "$500.00", feeTotal: "-$50.00", adservingTechFees: "$0.00", production: "$0.00", totalAmount: "$450.00",
    mediaCosts: { television: "$500.00" },
    lineItems: { television: [{ id: "neg001TV1", header1: "Seven", header2: "Sydney", monthlyAmounts: { [OCT]: 500 }, totalAmount: 500 }] } },
]

function version(schedule: unknown) {
  return {
    id: 9001, mba_number: "neg001", version_number: 1, campaign_status: "approved", campaign_name: "neg001",
    mp_client_name: "Neg", clients_id: 1, campaign_start_date: "2026-10-01", campaign_end_date: "2026-10-31",
    billingSchedule: schedule,
  }
}

for (const [layout, schedule] of [["old Xano layout", xano], ["app layout", app]] as const) {
  test(`${layout}: a negative saved fee flows through with its minus sign`, () => {
    const [month] = parsePersistedBillingScheduleToMonths(schedule)!
    assert.equal(month!.feeTotal, "-$50.00")
    assert.equal(month!.totalAmount, "$450.00")
    assert.equal(monthExGstFromScheduleEntry(month as unknown as Record<string, unknown>), 450)
    assert.equal(serviceAmountsFromBillingMonth(month!).assembledFee, -50)
    assert.equal(parseSavedBillingForEditor(schedule)!.billingTotalFormatted, "$450.00")

    const fin = computeCampaignFinancialsFromVersion(version(schedule))!
    assert.equal(fin.mbaScopeTotals.fee, -50)
    assert.equal(fin.mbaScopeTotals.nettExGst, 450)
    assert.equal(fin.validation.billableEqualsMba, true)
  })

  test(`${layout}: C-163 (today, not decided): readers that drop a fee at or below 0`, () => {
    const [record] = derivePlanReceivableBillingRecordsForMonth(
      [version(schedule)], 2026, 10, new Map([["Seven", { billingagency: "assembled media" }]]), new Map(), [],
      { includeNonBookedCampaigns: true },
    )
    assert.ok(record)
    // The record total carries the credit, but no Assembled Fee line is written.
    assert.equal(record.total, 450)
    assert.equal(record.line_items.some((l) => l.description === "Assembled Fee"), false)
    assert.equal(record.line_items.reduce((s, l) => s + l.amount, 0), 500)

    // schedule_months: the header fee row is skipped for a month with line items.
    const exploded = explodeScheduleToMonthRows(9001, "billing", schedule)
    assert.equal(exploded.failureReason, null)
    assert.equal(exploded.rows.some((r) => r.component === "fee"), false)
    assert.equal(sumScheduleCents(exploded.rows), 50000)
  })
}
