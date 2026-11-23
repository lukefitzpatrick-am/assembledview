/**
 * C-399: Ava's billed figure counts sent invoices only, each Xero invoice once.
 * A `xero:` row is the invoice; an app record counts once sent, and not when
 * its matched invoice has a `xero:` row too. Voided and deleted invoices are
 * not billed. The tool runs against a fake Ava database.
 */
import assert from "node:assert/strict"
import { after, test } from "node:test"

import { setAvaDbForTests } from "@/db/avaClient"
import { queryFinanceSummaryTool } from "../queryFinanceSummary.js"
import type { AvaToolContext } from "../types.js"

type Row = Record<string, unknown>
const bill = (over: Row): Row => ({
  invoiceKey: "",
  billingMonth: "2026-05",
  total: null,
  billedAmountCents: null,
  approvedAmountCents: null,
  matchedXeroInvoiceId: null,
  exportedAt: null,
  billed: false,
  xeroStatus: null,
  ...over,
})

function fakeDb(billRows: Row[]) {
  let call = 0
  const chain: Record<string, unknown> = {}
  for (const m of ["select", "from", "leftJoin", "innerJoin", "where"]) chain[m] = () => chain
  chain.limit = async () => (call++ === 0 ? billRows : [])
  return chain as unknown as Parameters<typeof setAvaDbForTests>[0]
}

const context = {
  pageContext: undefined,
  clientSlug: undefined,
  mbaNumber: undefined,
  versionNumber: undefined,
  enabledMediaTypes: undefined,
  userSub: "admin-1",
  userEmail: "admin@example.com",
  roles: ["admin"],
  clientSlugs: [],
  mbaNumbers: [],
  capturedPatch: null,
  capturedAttachments: null,
  capturedQuestions: null,
  pendingParsedPlan: null,
  capturedLineItemsLoad: null,
  currentLineItems: null,
} as unknown as AvaToolContext

const priorUrl = process.env.AVA_DATABASE_URL
process.env.AVA_DATABASE_URL = "postgres://ava-test"
after(() => {
  setAvaDbForTests(null)
  if (priorUrl === undefined) delete process.env.AVA_DATABASE_URL
  else process.env.AVA_DATABASE_URL = priorUrl
})

async function summary(rows: Row[]) {
  setAvaDbForTests(fakeDb(rows))
  const out = await queryFinanceSummaryTool.execute({ mba: "AC-001" }, context)
  assert.equal(out.isError, false, String(out.content))
  return JSON.parse(String(out.content)) as {
    billed_total_aud: number
    billed_invoice_count: number
    billing_record_count: number
    months: Array<{ month: string; billed_aud: number }>
  }
}

test("each Xero invoice counts once: the app record matched to a `xero:` row is left out", async () => {
  const out = await summary([
    bill({ invoiceKey: "xero:INV-1", billedAmountCents: 100000, billed: true, xeroStatus: "PAID" }),
    bill({ invoiceKey: "media:AC-001:2026-05", matchedXeroInvoiceId: " inv-1 ", approvedAmountCents: 100000, total: "1000.00", xeroStatus: "PAID" }),
  ])
  assert.equal(out.billed_total_aud, 1000)
  assert.equal(out.billed_invoice_count, 1)
  assert.equal(out.billing_record_count, 2)
})

test("only sent records count: approved and not sent is not billed", async () => {
  const out = await summary([
    bill({ invoiceKey: "media:AC-001:2026-06", billingMonth: "2026-06", approvedAmountCents: 50000, total: "500.00" }),
    bill({ invoiceKey: "media:AC-001:2026-09", billingMonth: "2026-09", matchedXeroInvoiceId: "  ", total: "90.00" }),
  ])
  assert.equal(out.billed_total_aud, 0)
  assert.equal(out.billed_invoice_count, 0)
})

test("a sent app record with no `xero:` row here counts once, at its approved amount", async () => {
  const out = await summary([
    bill({ invoiceKey: "media:AC-001:2026-07", billingMonth: "2026-07", exportedAt: "2026-07-02T00:00:00Z", approvedAmountCents: 30000, total: "299.99" }),
    bill({ invoiceKey: "media:AC-001:2026-08", billingMonth: "2026-08", matchedXeroInvoiceId: "INV-9", approvedAmountCents: 20000, xeroStatus: "AUTHORISED" }),
    bill({ invoiceKey: "media:AC-001:2026-10", billingMonth: "2026-10", billed: true, billedAmountCents: 1234 }),
  ])
  assert.deepEqual(
    out.months.map((m) => [m.month, m.billed_aud]),
    [
      ["2026-07", 300],
      ["2026-08", 200],
      ["2026-10", 12.34],
    ],
  )
  assert.equal(out.billed_invoice_count, 3)
})

test("voided and deleted Xero invoices are not billed, on a `xero:` row or a match", async () => {
  const out = await summary([
    bill({ invoiceKey: "xero:INV-2", billedAmountCents: 40000, billed: true, xeroStatus: "VOIDED" }),
    bill({ invoiceKey: "xero:INV-3", billedAmountCents: 5000, billed: true, xeroStatus: " deleted " }),
    bill({ invoiceKey: "media:AC-001:2026-05", matchedXeroInvoiceId: "INV-4", approvedAmountCents: 7000, xeroStatus: "VOIDED" }),
    bill({ invoiceKey: "xero:INV-5", billedAmountCents: 600, billed: true, xeroStatus: "AUTHORISED" }),
  ])
  assert.equal(out.billed_total_aud, 6)
  assert.equal(out.billed_invoice_count, 1)
})
