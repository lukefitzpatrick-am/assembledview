import assert from "node:assert/strict"
import { mock, test } from "node:test"

import type { BillingMonth } from "../../billing/types.js"
import { monthExGstFromScheduleEntry } from "../computeBillableAlignedMbaTotal.js"
import {
  computeCampaignFinancialsFromVersion,
  findScheduleMonthForCalendar,
} from "../computeCampaignFinancialsFromVersion.js"
import { derivePlanReceivableBillingRecordsForMonth } from "../deriveReceivableRecords.js"

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function emptyMediaCosts(): BillingMonth["mediaCosts"] {
  return {
    search: "$0.00",
    socialMedia: "$0.00",
    television: "$0.00",
    radio: "$0.00",
    newspaper: "$0.00",
    magazines: "$0.00",
    ooh: "$0.00",
    cinema: "$0.00",
    digiDisplay: "$0.00",
    digiAudio: "$0.00",
    digiVideo: "$0.00",
    bvod: "$0.00",
    integration: "$0.00",
    progDisplay: "$0.00",
    progVideo: "$0.00",
    progBvod: "$0.00",
    progAudio: "$0.00",
    progOoh: "$0.00",
    influencers: "$0.00",
    production: "$0.00",
  }
}

function derive(
  version: Record<string, unknown>,
  options: { includeNonBookedCampaigns: boolean } = { includeNonBookedCampaigns: false }
) {
  return derivePlanReceivableBillingRecordsForMonth(
    [version],
    2026,
    5,
    new Map(),
    new Map(),
    [],
    options
  )
}

function agencyPaysSearchLine(amount: number) {
  return {
    id: "billing-search::SEARCH1",
    header1: "Google Ads",
    header2: "Brand",
    monthlyAmounts: { "May 2026": amount },
    totalAmount: amount,
    clientPaysForMedia: false,
    mediaType: "Search",
    publisher: "Google Ads",
  }
}

function clientPaysSocialLine(amount: number) {
  return {
    id: "billing-socialMedia::SOC1",
    header1: "Meta",
    header2: "Prospecting",
    monthlyAmounts: { "May 2026": amount },
    totalAmount: amount,
    clientPaysForMedia: true,
    mediaType: "Social Media",
    publisher: "Meta",
  }
}

function monthFromParts(args: {
  mediaTotal: number
  feeTotal: number
  lineItems: NonNullable<BillingMonth["lineItems"]>
}): BillingMonth {
  const { mediaTotal, feeTotal, lineItems } = args
  return {
    monthYear: "May 2026",
    mediaTotal: `$${mediaTotal.toFixed(2)}`,
    feeTotal: `$${feeTotal.toFixed(2)}`,
    totalAmount: `$${(mediaTotal + feeTotal).toFixed(2)}`,
    adservingTechFees: "$0.00",
    production: "$0.00",
    mediaCosts: emptyMediaCosts(),
    lineItems,
  }
}

function versionWithStatus(
  status: string,
  billing: BillingMonth,
  extras: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: 9101,
    clients_id: 11,
    client_name: "SF8 Client",
    mba_number: "sf8001",
    campaign_name: "SF8 Campaign",
    campaign_status: status,
    version_number: 1,
    billingSchedule: [billing],
    deliverySchedule: [billing],
    ...extras,
  }
}

test("SF-8 D1: booked campaign → recordStatus booked", () => {
  const billing = monthFromParts({
    mediaTotal: 1000,
    feeTotal: 200,
    lineItems: { search: [agencyPaysSearchLine(1000)] },
  })
  const [record] = derive(versionWithStatus("booked", billing))
  assert.ok(record)
  assert.equal(record.status, "booked")
})

test("SF-8 D1: approved campaign → recordStatus booked", () => {
  const billing = monthFromParts({
    mediaTotal: 1000,
    feeTotal: 200,
    lineItems: { search: [agencyPaysSearchLine(1000)] },
  })
  const [record] = derive(versionWithStatus("approved", billing))
  assert.ok(record)
  assert.equal(record.status, "booked")
})

test("SF-8 D1: planned campaign → recordStatus draft", () => {
  const billing = monthFromParts({
    mediaTotal: 1000,
    feeTotal: 200,
    lineItems: { search: [agencyPaysSearchLine(1000)] },
  })
  const [record] = derive(versionWithStatus("planned", billing), {
    includeNonBookedCampaigns: true,
  })
  assert.ok(record)
  assert.equal(record.status, "draft")
})

test("SF-8 D2: clientPaysMedia true media line is refused from line_items and logged", () => {
  const logs: string[] = []
  mock.method(console, "log", (...args: unknown[]) => {
    logs.push(args.map(String).join(" "))
  })

  const billing = monthFromParts({
    mediaTotal: 0,
    feeTotal: 250,
    lineItems: {
      socialMedia: [clientPaysSocialLine(8000)],
    },
  })
  const [record] = derive(versionWithStatus("booked", billing, { mba_number: "sf8cp01" }))
  assert.ok(record)
  assert.equal(
    record.line_items.filter((li) => li.line_type === "media").length,
    0,
    "client-pays media must never be a receivable row"
  )
  const dropLog = logs.find((line) => line.includes("[finance-derive]") && line.includes("dropped"))
  assert.ok(dropLog, "expected a drop log for the client-pays media line")
  assert.match(dropLog!, /\[finance-derive\] sf8cp01 2026-05: dropped 1 client-pays media lines \(\$8000/)
})

test("SF-8 D2: clientPaysMedia false media line is present unchanged", () => {
  const billing = monthFromParts({
    mediaTotal: 1000,
    feeTotal: 200,
    lineItems: { search: [agencyPaysSearchLine(1000)] },
  })
  const [record] = derive(versionWithStatus("booked", billing))
  assert.ok(record)
  const media = record.line_items.filter((li) => li.line_type === "media")
  assert.equal(media.length, 1)
  assert.equal(media[0]!.amount, 1000)
  assert.equal(media[0]!.client_pays_media, false)
})

test("SF-8 D2: fee / service lines always client_pays_media false", () => {
  const billing = monthFromParts({
    mediaTotal: 0,
    feeTotal: 250,
    lineItems: {
      socialMedia: [clientPaysSocialLine(0)],
    },
  })
  // Force a fee-only month via header (client-pays media amount 0 is already skipped).
  const [record] = derive(versionWithStatus("booked", billing))
  assert.ok(record)
  const fees = record.line_items.filter((li) => li.line_type !== "media")
  assert.ok(fees.length > 0)
  for (const fee of fees) {
    assert.equal(fee.client_pays_media, false)
  }
})

test("SF-8: after dropping client-pays media, record.total still equals monthExGstFromScheduleEntry", () => {
  const billing = monthFromParts({
    mediaTotal: 1000,
    feeTotal: 200,
    lineItems: {
      search: [agencyPaysSearchLine(1000)],
      socialMedia: [clientPaysSocialLine(500)],
    },
  })
  const version = versionWithStatus("booked", billing)
  const financials = computeCampaignFinancialsFromVersion(version)
  assert.ok(financials)
  const coreMonth = findScheduleMonthForCalendar(financials!.billingSchedule, 2026, 5)
  assert.ok(coreMonth)
  const headerTotal = monthExGstFromScheduleEntry(
    coreMonth as unknown as Record<string, unknown>
  )

  const [record] = derive(version)
  assert.ok(record)
  assert.equal(round2(record.total), round2(headerTotal))

  const lineSum = round2(record.line_items.reduce((s, li) => s + li.amount, 0))
  assert.equal(
    lineSum,
    round2(record.total),
    `header and remaining lines must agree after the drop (header ${headerTotal}, lines ${lineSum})`
  )
})

test("SF-8: stale persisted schedule with non-zero client-pays month yields no receivable media line", () => {
  const logs: string[] = []
  mock.method(console, "log", (...args: unknown[]) => {
    logs.push(args.map(String).join(" "))
  })

  // Persisted billing blob still has $4,000 on a line that is now client-pays.
  // Header also still includes that amount — the save-time zero never ran.
  const billing = monthFromParts({
    mediaTotal: 4000,
    feeTotal: 500,
    lineItems: {
      socialMedia: [clientPaysSocialLine(4000)],
    },
  })
  const version = versionWithStatus("booked", billing, { mba_number: "sf8stale" })
  const [record] = derive(version)
  assert.ok(record, "fee still produces a receivable record")
  assert.equal(
    record.line_items.filter((li) => li.line_type === "media").length,
    0,
    "stale non-zero client-pays media must not appear as a receivable line"
  )
  const dropLog = logs.find((line) => line.includes("dropped") && line.includes("sf8stale"))
  assert.ok(dropLog)
  assert.match(dropLog!, /dropped 1 client-pays media lines \(\$4000/)

  const financials = computeCampaignFinancialsFromVersion(version)
  const coreMonth = findScheduleMonthForCalendar(financials!.billingSchedule, 2026, 5)
  const headerTotal = monthExGstFromScheduleEntry(
    coreMonth as unknown as Record<string, unknown>
  )
  assert.equal(round2(record.total), round2(headerTotal))
  const lineSum = round2(record.line_items.reduce((s, li) => s + li.amount, 0))
  // Header still includes the leaked media. That disagreement is the persisted-schedule bug.
  assert.notEqual(lineSum, round2(record.total))
})
