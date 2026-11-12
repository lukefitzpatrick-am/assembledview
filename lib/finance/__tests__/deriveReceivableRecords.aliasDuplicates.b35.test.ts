/**
 * B35 (MB-37): an invoice draft month that holds an old line id and its
 * current id with money (malay004 v4 shape) is flagged on the record with
 * the switch on. No row is dropped and the total is unchanged. Off: no field.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import type { BillingMonth } from "@/lib/billing/types"
import { derivePlanReceivableBillingRecordsForMonth } from "@/lib/finance/deriveReceivableRecords"

const JUNE = "June 2026"

function oohLine(id: string, amount: number) {
  return {
    id,
    header1: "JCDecaux",
    header2: "Large format",
    monthlyAmounts: { [JUNE]: amount },
    totalAmount: amount,
    mediaType: "OOH",
    publisher: "JCDecaux",
  }
}

function version(lineItems: NonNullable<BillingMonth["lineItems"]>, media: number): Record<string, unknown> {
  const month: BillingMonth = {
    monthYear: JUNE,
    mediaTotal: `$${media.toFixed(2)}`,
    feeTotal: "$0.00",
    totalAmount: `$${media.toFixed(2)}`,
    adservingTechFees: "$0.00",
    production: "$0.00",
    mediaCosts: { ooh: `$${media.toFixed(2)}` } as BillingMonth["mediaCosts"],
    lineItems,
  }
  return {
    id: 19001,
    clients_id: 21,
    client_name: "Malay",
    mba_number: "malay004",
    campaign_name: "Winter",
    campaign_status: "booked",
    version_number: 4,
    billingSchedule: [month],
    deliverySchedule: [month],
  }
}

const derive = (v: Record<string, unknown>, flag?: boolean) =>
  derivePlanReceivableBillingRecordsForMonth([v], 2026, 6, new Map(), new Map(), [], {
    includeNonBookedCampaigns: false,
    ...(flag === undefined ? {} : { flagBillingAliasDuplicates: flag }),
  })

const doubled = version(
  { ooh: [oohLine("billing-ooh::malay004ML1", 37000), oohLine("billing-ooh::malay004OH1", 37000)] } as NonNullable<
    BillingMonth["lineItems"]
  >,
  74000,
)

test("switch on: the doubled line is flagged, both rows stay, the total is the month as saved", () => {
  mock.method(console, "log", () => {})
  const warn = mock.method(console, "warn", () => {})
  const [record] = derive(doubled, true)
  assert.ok(record)
  assert.deepEqual(record.billing_alias_duplicates, [
    { mediaKey: "ooh", oldId: "malay004ML1", currentId: "malay004OH1", oldAmount: 37000, currentAmount: 37000 },
  ])
  assert.equal(record.total, 74000)
  const media = record.line_items.filter((l) => l.line_type === "media")
  assert.equal(media.reduce((s, l) => s + l.amount, 0), 74000)
  assert.ok(warn.mock.calls.some((c) => String(c.arguments[0]).includes("counted twice")))
  mock.restoreAll()
})

test("switch off or unset: no field", () => {
  mock.method(console, "log", () => {})
  assert.equal(derive(doubled, false)[0]!.billing_alias_duplicates, undefined)
  assert.equal(derive(doubled)[0]!.billing_alias_duplicates, undefined)
  mock.restoreAll()
})

test("switch on, a clean month: no field", () => {
  mock.method(console, "log", () => {})
  const clean = version({ ooh: [oohLine("billing-ooh::malay004OH1", 37000)] } as NonNullable<BillingMonth["lineItems"]>, 37000)
  assert.equal(derive(clean, true)[0]!.billing_alias_duplicates, undefined)
  mock.restoreAll()
})
