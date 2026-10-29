/**
 * T9: sales credit notes from /CreditNotes land in xero_ar_invoices as
 * negative amounts, never owed (amount due 0), behind XERO_SYNC_CREDIT_NOTES.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import {
  arNotCreditNoteSql,
  creditNoteToXeroInvoice,
  isXeroCreditNoteSyncEnabled,
  type XeroCreditNote,
} from "../creditNotes"
import { ingestCreditNotePages, type UpsertPagedInvoiceResult, type XeroInvoice } from "../stages/ingestInvoices"

const CN: XeroCreditNote = {
  CreditNoteID: "cn-1",
  CreditNoteNumber: "CN-0042",
  Type: "ACCRECCREDIT",
  Status: "AUTHORISED",
  SubTotal: 100,
  TotalTax: 10,
  Total: 110,
  RemainingCredit: 110,
  DateString: "2026-10-15T00:00:00",
  Reference: "golf025",
  LineAmountTypes: "Exclusive",
  LineItems: [{ Description: "Fee", LineAmount: 100, TaxAmount: 10 }],
  Contact: { ContactID: "c-1" },
}

test("flag is off unless exactly true", () => {
  assert.equal(isXeroCreditNoteSyncEnabled({} as unknown as NodeJS.ProcessEnv), false)
  assert.equal(isXeroCreditNoteSyncEnabled({ XERO_SYNC_CREDIT_NOTES: "1" } as unknown as NodeJS.ProcessEnv), false)
  assert.equal(isXeroCreditNoteSyncEnabled({ XERO_SYNC_CREDIT_NOTES: "true" } as unknown as NodeJS.ProcessEnv), true)
})

test("a credit note maps to the invoice shape: its id and number, nothing owed, Type kept", () => {
  const inv = creditNoteToXeroInvoice(CN)
  assert.equal(inv.InvoiceID, "cn-1")
  assert.equal(inv.InvoiceNumber, "CN-0042")
  assert.equal(inv.Type, "ACCRECCREDIT")
  assert.equal(inv.AmountDue, 0)
  assert.equal(inv.AmountPaid, 0)
  assert.equal(inv.DueDateString, undefined)
  assert.equal(inv.LineAmountTypes, "Exclusive")
  assert.equal(inv.RemainingCredit, 110)
})

test("reader predicate excludes sales credit notes, with or without an alias", () => {
  assert.equal(arNotCreditNoteSql(), "coalesce(upper(raw_json->>'Type'), '') <> 'ACCRECCREDIT'")
  assert.equal(arNotCreditNoteSql("i"), "coalesce(upper(i.raw_json->>'Type'), '') <> 'ACCRECCREDIT'")
})

function fakeFetch(pages: Array<{ status?: number; notes: unknown[] }>, seen: string[]): typeof fetch {
  return (async (url: unknown, init?: { headers?: Record<string, string> }) => {
    seen.push(`${String(url)}|${init?.headers?.["If-Modified-Since"] ?? ""}`)
    const page = Number(new URL(String(url)).searchParams.get("page"))
    const p = pages[page - 1] ?? { notes: [] }
    return new Response(JSON.stringify({ CreditNotes: p.notes }), { status: p.status ?? 200 })
  }) as typeof fetch
}

test("pages /CreditNotes from the watermark, upserts sales credit notes only, stops on an empty page", async () => {
  const seen: string[] = []
  const upserted: XeroInvoice[] = []
  const upsert = async (inv: XeroInvoice): Promise<UpsertPagedInvoiceResult> => {
    upserted.push(inv)
    return { kind: "ar", id: 1, mbaMatchId: null, signedTotal: -110, referenceRaw: "", issueDate: null, invoiceNumber: null }
  }
  const out = await ingestCreditNotePages({
    accessToken: "t",
    watermarkStr: "2026-10-01T00:00:00",
    fetchImpl: fakeFetch([{ notes: [CN, { ...CN, CreditNoteID: "cn-ap", Type: "ACCPAYCREDIT" }] }, { notes: [{ ...CN, CreditNoteID: "cn-2" }] }], seen),
    runStartedAt: new Date("2026-11-02T00:00:00Z"),
    upsert,
  })
  assert.deepEqual(out, { pages: 2, upserted: 2, incomplete: false, errors: [] })
  assert.deepEqual(upserted.map((u) => u.InvoiceID), ["cn-1", "cn-2"])
  assert.equal(seen.length, 3)
  assert.ok(seen[0]!.includes("/CreditNotes?page=1|2026-10-01T00:00:00"))
})

test("an HTTP error is reported, and a walk that hits the cap is incomplete", async () => {
  const upsert = async (): Promise<UpsertPagedInvoiceResult> => ({ kind: "ar", id: 1, mbaMatchId: null, signedTotal: -1, referenceRaw: "", issueDate: null, invoiceNumber: null })
  const err = await ingestCreditNotePages({ accessToken: "t", watermarkStr: "w", fetchImpl: fakeFetch([{ status: 403, notes: [] }], []), runStartedAt: new Date(), upsert })
  assert.deepEqual(err.errors, ["CreditNotes page 1: HTTP 403"])
  const capped = await ingestCreditNotePages({ accessToken: "t", watermarkStr: "w", fetchImpl: fakeFetch([{ notes: [CN] }, { notes: [CN] }], []), runStartedAt: new Date(), upsert, pagesCap: 1 })
  assert.equal(capped.incomplete, true)
  assert.equal(capped.upserted, 1)
})
