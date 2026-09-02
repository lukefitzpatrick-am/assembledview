import assert from "node:assert/strict"
import test from "node:test"
import { clientMissingBlockers } from "../../periods/preRunSweep.js"
import { formatAUD } from "../../../../lib/format/money.js"
import type { BillingRecord } from "../../../types/financeBilling.js"
import {
  INVOICING_CLIENT_GRID_CLASS,
  buildMediaTypeRollups,
  formatMediaTypeCaption,
  invoicingPrimaryAction,
  invoicingPrimaryLabel,
  invoicingRowBlockers,
  scopeMonthBlocker,
} from "../invoicingRowPresentation.js"

function rec(partial: Partial<BillingRecord>): BillingRecord {
  return {
    id: 1,
    clients_id: 1,
    client_name: "BIC",
    billing_type: "media",
    mba_number: "BIC001",
    campaign_name: "Camp",
    billing_month: "2026-07",
    status: "booked",
    total: 2916.66,
    line_items: [],
    billed: false,
    invoice_key: "media:BIC001:2026-07",
    ...partial,
  } as BillingRecord
}

test("Ready → Approve; Approved → Mark sent; sent_to_finance and beyond → no primary", () => {
  assert.equal(invoicingPrimaryAction("ready"), "approve")
  assert.equal(invoicingPrimaryLabel("approve"), "Approve")
  assert.equal(invoicingPrimaryAction("approved"), "mark_sent")
  assert.equal(invoicingPrimaryLabel("mark_sent"), "Mark sent")
  assert.equal(invoicingPrimaryAction("sent_to_finance"), null)
  assert.equal(invoicingPrimaryAction("drafted"), null)
  assert.equal(invoicingPrimaryAction("issued"), null)
  assert.equal(invoicingPrimaryAction("paid"), null)
  assert.equal(invoicingPrimaryAction("overdue"), null)
})

test("blocked row reuses clientMissingBlockers and surfaces the reason", () => {
  const viaPredicate = clientMissingBlockers({
    id: 9,
    name: "BIC",
    abn: "",
    legalBusinessName: "",
    poRequired: true,
    poNumber: "",
  })
  const viaRow = invoicingRowBlockers({
    clientsId: 9,
    clientName: "BIC",
    record: rec({ clients_id: 9, client_name: "BIC", po_number: "" }),
    clientMeta: { abn: "", legalBusinessName: "", poRequired: true },
  })
  assert.deepEqual(
    viaRow.map((b) => b.kind).sort(),
    viaPredicate.map((b) => b.kind).sort()
  )
  assert.ok(viaRow.some((b) => b.kind === "missing_abn"))
  assert.ok(viaRow.some((b) => b.kind === "missing_legal_name"))
  assert.ok(viaRow.some((b) => b.kind === "missing_po"))
  assert.ok(viaRow.some((b) => /missing ABN/i.test(b.detail)))
})

test("a sow with $0 or missing month is a row blocker", () => {
  const zero = scopeMonthBlocker({
    billing_type: "sow",
    billing_month: "2026-07",
    total: 0,
    client_name: "BIC",
    clients_id: 9,
  })
  const missing = scopeMonthBlocker({
    billing_type: "sow",
    billing_month: "",
    total: 100,
    client_name: "BIC",
    clients_id: 9,
  })
  const ok = scopeMonthBlocker({
    billing_type: "sow",
    billing_month: "2026-07",
    total: 100,
    client_name: "BIC",
    clients_id: 9,
  })
  const media = scopeMonthBlocker({
    billing_type: "media",
    billing_month: "",
    total: 0,
    client_name: "BIC",
    clients_id: 9,
  })
  assert.ok(zero)
  assert.ok(missing)
  assert.equal(ok, null)
  assert.equal(media, null)
  assert.match(zero!.detail, /\$0 or missing month/)
})

test("client grid is one column by default and two from 700px", () => {
  assert.match(INVOICING_CLIENT_GRID_CLASS, /\bgrid-cols-1\b/)
  assert.match(INVOICING_CLIENT_GRID_CLASS, /min-\[700px\]:grid-cols-2/)
  assert.equal(INVOICING_CLIENT_GRID_CLASS.includes("md:grid-cols-2"), false)
})

test("fixture month totals are byte-identical to the pre-change formatAUD render", () => {
  const records = [
    rec({
      total: 2916.66,
      line_items: [
        {
          id: 1,
          finance_billing_records_id: 1,
          item_code: "SOC",
          line_type: "media",
          media_type: "Social Media",
          description: "Meta",
          publisher_name: null,
          amount: 2625,
          client_pays_media: false,
          sort_order: 0,
        },
        {
          id: 2,
          finance_billing_records_id: 1,
          item_code: "OTH",
          line_type: "fee",
          media_type: "Other",
          description: "Fee",
          publisher_name: null,
          amount: 291.66,
          client_pays_media: false,
          sort_order: 1,
        },
      ],
    }),
  ]
  const clientTotal = records.reduce((s, r) => s + r.total, 0)
  const rollups = buildMediaTypeRollups(records)
  const caption = formatMediaTypeCaption(rollups)
  assert.equal(formatAUD(clientTotal), formatAUD(2916.66))
  assert.equal(formatAUD(rollups[0]!.total), formatAUD(2625))
  assert.equal(formatAUD(rollups[1]!.total), formatAUD(291.66))
  assert.equal(caption, `Social Media ${formatAUD(2625)} · Other ${formatAUD(291.66)}`)
  assert.equal(
    formatAUD(rollups.reduce((s, r) => s + r.total, 0)),
    formatAUD(clientTotal)
  )
})
