import assert from "node:assert/strict"
import test from "node:test"
import { clientMissingBlockers } from "../../periods/preRunSweep.js"
import { formatAUD } from "../../../../lib/format/money.js"
import type { BillingLineItem, BillingRecord } from "../../../types/financeBilling.js"
import {
  INVOICING_CLIENT_GRID_CLASS,
  INVOICING_EX_GST_HEADER,
  buildMediaTypeRollups,
  formatMediaTypeCaption,
  toBillCaptionLabel,
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

test("Ready → Approve; Approved and beyond → no primary", () => {
  assert.equal(invoicingPrimaryAction("ready"), "approve")
  assert.equal(invoicingPrimaryLabel("approve"), "Approve")
  assert.equal(invoicingPrimaryAction("approved"), null)
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
  })
  const viaRow = invoicingRowBlockers({
    clientsId: 9,
    clientName: "BIC",
    record: rec({ clients_id: 9, client_name: "BIC", po_number: "" }),
    clientMeta: { abn: "", legalBusinessName: "" },
  })
  assert.deepEqual(
    viaRow.map((b) => b.kind).sort(),
    viaPredicate.map((b) => b.kind).sort()
  )
  // No PO column / no PO data → missing_po is not a blocker. Full list so a
  // wider deletion (ABN / legal name) fails this test.
  assert.deepEqual(viaRow.map((b) => b.kind).sort(), [
    "missing_abn",
    "missing_legal_name",
  ])
  assert.ok(viaRow.some((b) => /missing ABN/i.test(b.detail)))
})

test("each remaining blocker fires on its own fixture", () => {
  const abnOnly = invoicingRowBlockers({
    clientsId: 9,
    clientName: "BIC",
    record: rec({ clients_id: 9, client_name: "BIC" }),
    clientMeta: { abn: "", legalBusinessName: "Ok Co Pty Ltd" },
  })
  assert.deepEqual(
    abnOnly.map((b) => b.kind),
    ["missing_abn"]
  )

  const legalOnly = invoicingRowBlockers({
    clientsId: 9,
    clientName: "BIC",
    record: rec({ clients_id: 9, client_name: "BIC" }),
    clientMeta: { abn: "11 111 111 111", legalBusinessName: "" },
  })
  assert.deepEqual(
    legalOnly.map((b) => b.kind),
    ["missing_legal_name"]
  )

  const sowZero = invoicingRowBlockers({
    clientsId: 9,
    clientName: "BIC",
    record: rec({
      clients_id: 9,
      client_name: "BIC",
      billing_type: "sow",
      billing_month: "2026-07",
      total: 0,
    }),
    clientMeta: { abn: "11 111 111 111", legalBusinessName: "Ok Co Pty Ltd" },
  })
  assert.deepEqual(
    sowZero.map((b) => b.kind),
    ["unapproved_scheduled"]
  )

  const sowMissingMonth = invoicingRowBlockers({
    clientsId: 9,
    clientName: "BIC",
    record: rec({
      clients_id: 9,
      client_name: "BIC",
      billing_type: "sow",
      billing_month: "",
      total: 100,
    }),
    clientMeta: { abn: "11 111 111 111", legalBusinessName: "Ok Co Pty Ltd" },
  })
  assert.deepEqual(
    sowMissingMonth.map((b) => b.kind),
    ["unapproved_scheduled"]
  )

  const noPoData = invoicingRowBlockers({
    clientsId: 9,
    clientName: "BIC",
    record: rec({ clients_id: 9, client_name: "BIC", po_number: "" }),
    clientMeta: { abn: "11 111 111 111", legalBusinessName: "Ok Co Pty Ltd" },
  })
  assert.deepEqual(noPoData.map((b) => b.kind), [])
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
  assert.equal(caption, `Social Media ${formatAUD(2625)} · Fees ${formatAUD(291.66)}`)
  assert.equal(toBillCaptionLabel(records[0]!.line_items[1]!), "Fees")
  assert.equal(
    formatAUD(rollups.reduce((s, r) => s + r.total, 0)),
    formatAUD(clientTotal)
  )
})

test("page header states the GST basis once", () => {
  assert.equal(INVOICING_EX_GST_HEADER, "All amounts ex-GST")
})

function line(partial: Partial<BillingLineItem> & Pick<BillingLineItem, "amount">): BillingLineItem {
  return {
    id: 1,
    finance_billing_records_id: 1,
    item_code: "X",
    line_type: "media",
    media_type: null,
    description: null,
    publisher_name: null,
    client_pays_media: false,
    sort_order: 0,
    ...partial,
  }
}

test("PGAAUS015 July names the fee instead of Other", () => {
  const social = 3439
  const fee = 859.75
  const records = [
    rec({
      mba_number: "PGAAUS015",
      billing_month: "2026-07",
      total: social + fee,
      line_items: [
        line({
          id: 1,
          item_code: "SOC",
          line_type: "media",
          media_type: "Social Media",
          description: "Meta",
          amount: social,
        }),
        line({
          id: 2,
          item_code: "Service",
          line_type: "service",
          media_type: null,
          description: "Assembled Fee",
          amount: fee,
        }),
      ],
    }),
  ]
  const rollups = buildMediaTypeRollups(records)
  const caption = formatMediaTypeCaption(rollups)
  assert.equal(caption, "Social Media $3,439.00 · Fees $859.75")
  assert.equal(
    formatAUD(rollups.reduce((s, r) => s + r.total, 0)),
    formatAUD(records[0]!.total)
  )
})

test("production and a retainer are named, and an unknown line stays Other", () => {
  const production = 400
  const retainer = 1500
  const mystery = 25
  const records = [
    rec({
      total: production + retainer + mystery,
      line_items: [
        line({
          id: 1,
          item_code: "Production",
          line_type: "service",
          description: "Production",
          amount: production,
        }),
        line({
          id: 2,
          item_code: "Retainer",
          line_type: "retainer",
          description: "Monthly retainer",
          amount: retainer,
        }),
        line({
          id: 3,
          item_code: "??",
          line_type: "service",
          description: "Something else",
          amount: mystery,
        }),
      ],
    }),
  ]
  const rollups = buildMediaTypeRollups(records)
  assert.equal(
    formatMediaTypeCaption(rollups),
    `Production ${formatAUD(production)} · Retainer ${formatAUD(retainer)} · Other ${formatAUD(mystery)}`
  )
  assert.equal(
    formatAUD(rollups.reduce((s, r) => s + r.total, 0)),
    formatAUD(records[0]!.total)
  )
})

test("named parts follow media types and a zero part is omitted", () => {
  const records = [
    rec({
      total: 100 + 10 + 20 + 30 + 40 + 5,
      line_items: [
        line({
          item_code: "T.Adserving",
          line_type: "service",
          description: "Adserving and Tech Fees",
          amount: 10,
        }),
        line({
          item_code: "SOC",
          line_type: "media",
          media_type: "Social Media",
          amount: 100,
        }),
        line({
          item_code: "Service",
          line_type: "service",
          description: "Assembled Fee",
          amount: 20,
        }),
        line({
          line_type: "media",
          media_type: null,
          description: "No type",
          amount: 30,
        }),
        line({
          item_code: "Production",
          line_type: "service",
          description: "Production",
          amount: 40,
        }),
        line({
          item_code: "Retainer",
          line_type: "retainer",
          description: "Monthly retainer",
          amount: 0,
        }),
        line({
          item_code: "??",
          line_type: "service",
          description: "Unknown",
          amount: 5,
        }),
      ],
    }),
  ]
  const rollups = buildMediaTypeRollups(records)
  assert.deepEqual(
    rollups.map((r) => r.mediaType),
    ["Social Media", "Fees", "Ad serving", "Production", "Untyped media", "Other"]
  )
  assert.equal(
    formatAUD(rollups.reduce((s, r) => s + r.total, 0)),
    formatAUD(100 + 10 + 20 + 30 + 40 + 5)
  )
})
