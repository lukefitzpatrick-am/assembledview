/**
 * The nightly matcher picks the same winner whatever order the database
 * returns invoices in (29 Oct 2026). Live case: INV-1426 (26 Aug, bare
 * number in the Reference, so plus or minus one month) and INV-1501 (30 Sep,
 * PO) both reach PENFOLD018 September.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

import type { MbaMaster } from "../../../xero/matchMba.js"
import {
  compareInvoicesForMatch,
  matchXeroInvoicesToAppRecords,
  type AppBillingMatchRecord,
  type XeroBillingMatchDecision,
  type XeroBillingMatchInvoice,
} from "../xeroBillingMatch.js"

const masters: MbaMaster[] = [{ id: 1, mba_number: "PENFOLD018" }]

function record(partial: Partial<AppBillingMatchRecord> & Pick<AppBillingMatchRecord, "invoiceKey">): AppBillingMatchRecord {
  return {
    clientsId: 7,
    billingType: "media",
    mbaNumber: "PENFOLD018",
    scopeId: null,
    billingMonth: "2026-09",
    approvedAmountCents: 10_000,
    scheduleMonthCents: null,
    legacyBilledCents: null,
    ...partial,
  }
}

function invoice(partial: Partial<XeroBillingMatchInvoice> & Pick<XeroBillingMatchInvoice, "xeroInvoiceId">): XeroBillingMatchInvoice {
  return {
    status: "AUTHORISED",
    issueDate: "2026-09-15",
    referenceRaw: "(PENFOLD018)",
    firstLineDescription: null,
    subTotalCents: 10_000,
    linkedClientId: 7,
    invoiceNumber: null,
    ...partial,
  }
}

function stamps(decisions: XeroBillingMatchDecision[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const d of decisions) {
    if (d.kind === "stamp") out[d.xeroInvoiceId] = [...d.invoiceKeys]
  }
  return out
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items]
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  )
}

const sep = record({ invoiceKey: "media:PENFOLD018:2026-09", approvedAmountCents: 18_757_160 })
const inv1426 = invoice({
  xeroInvoiceId: "baa63fd9",
  invoiceNumber: "INV-1426",
  issueDate: "2026-08-26",
  referenceRaw: "Penfolds - Grange Hero FY2027 (PENFOLD018) |  1005369",
  subTotalCents: 550_993,
})
const inv1501 = invoice({
  xeroInvoiceId: "247e71f5",
  invoiceNumber: "INV-1501",
  issueDate: "2026-09-30",
  referenceRaw: "Penfolds - Grange Hero Burst 1 FY27 (PENFOLD018) | PO 1005369",
  subTotalCents: 726_985,
})

test("INV-1426 vs INV-1501 for PENFOLD018 Sep: same winner in either row order", () => {
  const a = matchXeroInvoicesToAppRecords({ masters, records: [sep], invoices: [inv1426, inv1501] })
  const b = matchXeroInvoicesToAppRecords({ masters, records: [sep], invoices: [inv1501, inv1426] })
  assert.deepEqual(stamps(a), stamps(b))
  // Earlier issue date goes first and takes the month.
  assert.deepEqual(stamps(a), { baa63fd9: ["media:PENFOLD018:2026-09"] })
  const loser = b.find((d) => d.xeroInvoiceId === "247e71f5")
  assert.equal(loser?.kind, "suggestion")
})

test("same issue date: lower invoice number wins, numeric-aware (INV-999 before INV-1000)", () => {
  const i999 = invoice({ xeroInvoiceId: "zzz", invoiceNumber: "INV-999" })
  const i1000 = invoice({ xeroInvoiceId: "aaa", invoiceNumber: "INV-1000" })
  for (const order of permutations([i999, i1000])) {
    const out = matchXeroInvoicesToAppRecords({ masters, records: [sep], invoices: order })
    assert.deepEqual(stamps(out), { zzz: ["media:PENFOLD018:2026-09"] })
  }
})

test("same date, no invoice numbers: xero_invoice_id breaks the tie", () => {
  const x1 = invoice({ xeroInvoiceId: "0001" })
  const x2 = invoice({ xeroInvoiceId: "0002" })
  for (const order of permutations([x2, x1])) {
    const out = matchXeroInvoicesToAppRecords({ masters, records: [sep], invoices: order })
    assert.deepEqual(stamps(out), { "0001": ["media:PENFOLD018:2026-09"] })
  }
})

test("comparator: missing issue date and missing number sort last", () => {
  const sorted = [
    invoice({ xeroInvoiceId: "d", issueDate: null, invoiceNumber: "INV-1" }),
    invoice({ xeroInvoiceId: "c", issueDate: "2026-09-02", invoiceNumber: null }),
    invoice({ xeroInvoiceId: "b", issueDate: "2026-09-02", invoiceNumber: "INV-20" }),
    invoice({ xeroInvoiceId: "a", issueDate: "2026-09-01T00:00:00", invoiceNumber: "INV-30" }),
  ].sort(compareInvoicesForMatch)
  assert.deepEqual(sorted.map((i) => i.xeroInvoiceId), ["a", "b", "c", "d"])
})

test("every input order of invoices and records gives the same decisions", () => {
  const records = [
    sep,
    record({ invoiceKey: "media:PENFOLD018:2026-08", billingMonth: "2026-08" }),
    record({ invoiceKey: "media:PENFOLD018:2026-10", billingMonth: "2026-10" }),
  ]
  const invoices = [
    invoice({ xeroInvoiceId: "i1", invoiceNumber: "INV-1", issueDate: "2026-09-10" }),
    invoice({ xeroInvoiceId: "i2", invoiceNumber: "INV-2", issueDate: "2026-09-10" }),
    invoice({ xeroInvoiceId: "i3", invoiceNumber: "INV-3", issueDate: "2026-08-20" }),
  ]
  const baseline = JSON.stringify(
    stamps(matchXeroInvoicesToAppRecords({ masters, records, invoices })),
  )
  for (const inv of permutations(invoices)) {
    for (const rec of permutations(records)) {
      const out = matchXeroInvoicesToAppRecords({ masters, records: rec, invoices: inv })
      assert.equal(JSON.stringify(stamps(out)), baseline)
    }
  }
})

test("matched_by manual is never a candidate, in any order", () => {
  // Shape of the 29 Oct hand fix (ids 38818, 38824, 38846): matched id cleared,
  // matched_by 'manual'. An invoice that would fit stays a suggestion.
  const held = record({
    invoiceKey: "media:hartm001:2026-10",
    mbaNumber: "hartm001",
    billingMonth: "2026-10",
    matchedBy: "manual",
  })
  const h: MbaMaster[] = [{ id: 2, mba_number: "hartm001" }]
  const inv = invoice({ xeroInvoiceId: "cbff7366", invoiceNumber: "INV-1484", issueDate: "2026-09-30", referenceRaw: "(hartm001)" })
  for (const matchedBy of ["manual", "Manual", " MANUAL "]) {
    const out = matchXeroInvoicesToAppRecords({
      masters: h,
      records: [{ ...held, matchedBy }],
      invoices: [inv],
    })
    assert.deepEqual(stamps(out), {})
  }
})

test("stage SQL: auto writes skip manual rows; loads are ordered; unlink only touches the voided invoice's rows", () => {
  const src = readFileSync(join(process.cwd(), "lib/xero/stages/matchBillingRecords.ts"), "utf8")
  assert.match(src, /AND \(matched_by IS NULL OR btrim\(matched_by\) = '' OR matched_by = 'auto'\)/)
  assert.match(src, /ORDER BY issue_date ASC NULLS LAST, invoice_number ASC NULLS LAST, xero_invoice_id ASC/)
  assert.match(src, /ORDER BY invoice_key/)
  assert.match(src, /WHERE matched_xero_invoice_id = \$1/)
  assert.match(src, /invoiceNumber: text\(row\.invoice_number\)/)
})
