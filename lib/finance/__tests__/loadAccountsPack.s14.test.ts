/**
 * S14 A: `loadAccountsPack` is the one choke point to Xero. Send to accounts'
 * preview and send both read it. With `billing_above_plan_hold` on, a media
 * record above plan with no covering reason is out of `rows` and `records`
 * (so out of the CSV, the workbook and the stamps) and in `held`. Off, the
 * pack is as before and nothing more is read.
 * Run with --experimental-test-module-mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const skip = mockModuleSkip()

function scheduleMonth(monthYear: string, total: number) {
  const money = (n: number) => "$" + n.toFixed(2)
  return {
    monthYear,
    mediaTotal: money(total),
    feeTotal: "$0.00",
    totalAmount: money(total),
    adservingTechFees: "$0.00",
    production: "$0.00",
    lineItems: { search: [{ id: "X1", header1: "Google", monthlyAmounts: { [monthYear]: total }, totalAmount: total }] },
  }
}
const version = (id: number, mba: string, may: number) => ({
  id,
  mba_number: mba,
  campaign_status: "booked",
  campaign_start_date: "2026-05-01",
  campaign_end_date: "2026-05-31",
  billingSchedule: [scheduleMonth("May 2026", may)],
  deliverySchedule: [scheduleMonth("May 2026", may)],
})
const record = (key: string, mba: string, id: number, versionId: number, total: number, type = "media") => ({
  invoice_key: key,
  persisted_record_id: id,
  billing_type: type,
  billing_month: "2026-05",
  clients_id: 1,
  client_name: "Acme",
  mba_number: mba,
  campaign_name: "Winter",
  status: "booked",
  approved_at: "2026-05-28T00:00:00Z",
  exported_at: null,
  media_plan_version_id: versionId,
  total,
  line_items: [],
})

// AC-001 bills $1,000 in May and has $1,000 billed already this month: held. AC-002 is within plan.
const records = [
  record("media:AC-001:2026-05", "AC-001", 11, 101, 1000),
  record("media:AC-002:2026-05", "AC-002", 12, 102, 400),
  record("retainer:R1:2026-05", "", 13, 0, 300, "retainer"),
]
const versions = [version(101, "AC-001", 1000), version(102, "AC-002", 400)]

let switchOn = false
let executed = 0

if (typeof mock.module === "function") {
  const realDb = await import("@/db/schema")
  await mock.module("@/lib/finance/loadComposedBillingMonth", {
    namedExports: { loadComposedBillingRecordsForMonth: async () => ({ ok: true, records, versions }) },
  })
  await mock.module("@/lib/features/server", {
    namedExports: { isFeatureOn: async (key: string) => key === "billing_above_plan_hold" && switchOn },
  })
  await mock.module("@/db", {
    namedExports: {
      schema: realDb,
      getDb: () => ({
        select: () => ({ from: async () => [{ clientId: 1 }] }),
        execute: async (q: unknown) => {
          executed++
          const text = JSON.stringify(q)
          return text.includes("billing_above_plan_reasons") ? [] : [{ mba: "ac-001", billing_month: "2026-05", cents: 100000 }]
        },
      }),
    },
  })
}

const { loadAccountsPack } = await import("../loadAccountsPack")

test("switch off: every approved row is in the pack and nothing more is read", { skip }, async () => {
  switchOn = false
  executed = 0
  const out = await loadAccountsPack("2026-05")
  assert.ok(!("ok" in out))
  assert.deepEqual(out.rows.map((r) => r.invoiceKey), ["media:AC-001:2026-05", "media:AC-002:2026-05", "retainer:R1:2026-05"])
  assert.deepEqual(out.held, [])
  assert.equal(executed, 0)
})

test("switch on: the record above plan is held, out of the rows and the records the pack is built from", { skip }, async () => {
  switchOn = true
  const out = await loadAccountsPack("2026-05")
  assert.ok(!("ok" in out))
  assert.deepEqual(out.rows.map((r) => r.invoiceKey), ["media:AC-002:2026-05", "retainer:R1:2026-05"])
  assert.deepEqual(out.records.map((r) => r.invoice_key), ["media:AC-002:2026-05", "retainer:R1:2026-05"])
  assert.deepEqual(
    out.held.map((h) => [h.invoiceKey, h.abovePlanCents]),
    [["media:AC-001:2026-05", 100000]],
  )
})
