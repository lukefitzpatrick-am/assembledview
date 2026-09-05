/**
 * C-95: receivables carry the client-pays fee, never the media;
 * payables and delivery accrual skip the line.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { buildBillingScheduleJSON } from "../../billing/buildBillingSchedule.js"
import {
  collectClientPaysForMediaFlagsFromSchedule,
  computeAccrualRows,
} from "../accrual.js"
import { sumPayableLineItems } from "../aggregatePayablesPublisherGroups.js"
import { derivePayableRecordsForMonth } from "../derivePayableRecords.js"
import { derivePlanReceivableBillingRecordsForMonth } from "../deriveReceivableRecords.js"
import { glenda008ClientPaysFinancials } from "./glenda008ClientPaysFee.fixture.js"

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function bookedVersion() {
  const f = glenda008ClientPaysFinancials()
  return {
    id: 13607,
    clients_id: 1,
    client_name: "Glendale Community College",
    mba_number: "glenda008",
    campaign_name: "Glendale",
    campaign_status: "booked",
    version_number: 6,
    billingSchedule: f.billingSchedule,
    deliverySchedule: f.deliverySchedule,
    line_items: [
      {
        version_id: 13607,
        line_item_id: "billing-socialMedia::glenda008SM1",
        client_pays_for_media: true,
      },
      {
        version_id: 13607,
        line_item_id: "billing-radio::glenda008RAD1",
        client_pays_for_media: false,
      },
    ],
  }
}

test("C-95: receivables carry 5,000 fee and 0 client-pays media", () => {
  const version = bookedVersion()
  let fee = 0
  let clientPaysMedia = 0
  for (const [year, month] of [
    [2026, 7],
    [2026, 8],
    [2026, 9],
  ] as const) {
    const records = derivePlanReceivableBillingRecordsForMonth(
      [version],
      year,
      month,
      new Map(),
      new Map(),
      [],
      { includeNonBookedCampaigns: false }
    )
    for (const record of records) {
      for (const li of record.line_items) {
        if (li.client_pays_media) clientPaysMedia += li.amount
        if (li.item_code === "Service") fee += li.amount
      }
    }
  }
  assert.equal(round2(clientPaysMedia), 0)
  assert.equal(round2(fee), 5_000)
})

test("C-95: payables exclude the client-pays social line", () => {
  const version = bookedVersion()
  let agency = 0
  for (const [year, month] of [
    [2026, 7],
    [2026, 8],
    [2026, 9],
  ] as const) {
    for (const record of derivePayableRecordsForMonth([version], year, month)) {
      assert.equal(round2(record.total), round2(sumPayableLineItems(record)))
      agency += sumPayableLineItems(record)
    }
  }
  assert.equal(round2(agency), 40_000)
})

test("C-95: delivery accrual excludes the client-pays social line", () => {
  const f = glenda008ClientPaysFinancials()
  const delivery = buildBillingScheduleJSON(f.deliverySchedule)
  const billing = buildBillingScheduleJSON(f.billingSchedule)
  const flags = collectClientPaysForMediaFlagsFromSchedule(delivery)
  const rows = computeAccrualRows({
    versions: [
      {
        clientName: "Glendale Community College",
        campaignName: "Glendale",
        mbaNumber: "glenda008",
        versionNumber: 6,
        deliverySchedule: delivery,
        billingSchedule: billing,
      },
    ],
    months: ["2026-07", "2026-08", "2026-09"],
    clientPaysForMediaByLineItemId: flags,
  })
  const social = rows.filter((r) =>
    /glenda008SM1|social|meta/i.test(`${r.lineItemKey} ${r.lineItemName}`)
  )
  for (const row of social) {
    assert.equal(round2(row.deliveryAmount), 0, "delivery accrual must skip client-pays media")
  }
})
