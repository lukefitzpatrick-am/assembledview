import assert from "node:assert/strict"
import test from "node:test"

import type { MbaMaster } from "../../../xero/matchMba.js"
import {
  invoiceCarriesPo,
  matchXeroInvoicesToAppRecords,
  type AppBillingMatchRecord,
  type XeroBillingMatchInvoice,
} from "../xeroBillingMatch.js"

const masters: MbaMaster[] = [{ id: 1, mba_number: "PENFOLD018" }]

function record(partial: Partial<AppBillingMatchRecord> & Pick<AppBillingMatchRecord, "invoiceKey">): AppBillingMatchRecord {
  return {
    clientsId: 7,
    billingType: "media",
    mbaNumber: "PENFOLD018",
    scopeId: null,
    billingMonth: "2026-07",
    approvedAmountCents: 10_000,
    scheduleMonthCents: null,
    legacyBilledCents: null,
    ...partial,
  }
}

function invoice(partial: Partial<XeroBillingMatchInvoice> & Pick<XeroBillingMatchInvoice, "xeroInvoiceId">): XeroBillingMatchInvoice {
  return {
    status: "AUTHORISED",
    issueDate: "2026-07-15",
    referenceRaw: "(PENFOLD018)",
    firstLineDescription: null,
    subTotalCents: 10_000,
    linkedClientId: 7,
    ...partial,
  }
}

test("reference token matches a billing month one month off issue_date, and exact month wins", () => {
  const adjacentOnly = matchXeroInvoicesToAppRecords({
    masters,
    invoices: [invoice({ xeroInvoiceId: "inv-adj" })],
    records: [record({ invoiceKey: "media:PENFOLD018:2026-06", billingMonth: "2026-06" })],
  })
  assert.equal(adjacentOnly[0]?.kind, "stamp")
  if (adjacentOnly[0]?.kind === "stamp") {
    assert.deepEqual(adjacentOnly[0].invoiceKeys, ["media:PENFOLD018:2026-06"])
  }

  const both = matchXeroInvoicesToAppRecords({
    masters,
    invoices: [invoice({ xeroInvoiceId: "inv-exact" })],
    records: [
      record({ invoiceKey: "media:PENFOLD018:2026-06", billingMonth: "2026-06" }),
      record({ invoiceKey: "media:PENFOLD018:2026-07", billingMonth: "2026-07" }),
    ],
  })
  assert.equal(both[0]?.kind, "stamp")
  if (both[0]?.kind === "stamp") {
    assert.deepEqual(both[0].invoiceKeys, ["media:PENFOLD018:2026-07"])
  }
})

test("N app records stamp one Xero invoice when their expected totals sum to sub_total within $1", () => {
  const decisions = matchXeroInvoicesToAppRecords({
    masters,
    invoices: [
      invoice({
        xeroInvoiceId: "inv-sum",
        referenceRaw: "July media",
        subTotalCents: 10_050,
      }),
    ],
    records: [
      record({
        invoiceKey: "media:PENFOLD018:2026-07:a",
        approvedAmountCents: 4_000,
      }),
      record({
        invoiceKey: "media:PENFOLD018:2026-07:b",
        mbaNumber: "OTHER001",
        approvedAmountCents: 6_000,
      }),
    ],
  })
  assert.equal(decisions[0]?.kind, "stamp")
  if (decisions[0]?.kind === "stamp") {
    assert.deepEqual(decisions[0].invoiceKeys, [
      "media:PENFOLD018:2026-07:a",
      "media:PENFOLD018:2026-07:b",
    ])
    assert.equal(decisions[0].drift, "auto_adopted")
    assert.equal(decisions[0].adoptCents, null)
  }
})

test("auto-adopts at $0.99 and leaves Differs at $1.01", () => {
  const row = record({ invoiceKey: "media:PENFOLD018:2026-07" })
  const adoptRun = matchXeroInvoicesToAppRecords({
    masters,
    invoices: [invoice({ xeroInvoiceId: "inv-adopt", subTotalCents: 10_099 })],
    records: [row],
  })
  const differsRun = matchXeroInvoicesToAppRecords({
    masters,
    invoices: [invoice({ xeroInvoiceId: "inv-differs", subTotalCents: 10_101 })],
    records: [row],
  })
  const adopt = adoptRun[0]
  const differs = differsRun[0]
  assert.equal(adopt?.kind, "stamp")
  assert.equal(differs?.kind, "stamp")
  if (adopt?.kind === "stamp") {
    assert.equal(adopt.drift, "auto_adopted")
    assert.equal(adopt.adoptCents, 10_099)
    assert.equal(adopt.expected[0]?.source, "approved_snapshot")
  }
  if (differs?.kind === "stamp") {
    assert.equal(differs.drift, "differs")
    assert.equal(differs.adoptCents, null)
  }
})

test("DELETED unlinks and does not stamp", () => {
  const decisions = matchXeroInvoicesToAppRecords({
    masters,
    invoices: [invoice({ xeroInvoiceId: "inv-dead", status: "DELETED" })],
    records: [record({ invoiceKey: "media:PENFOLD018:2026-07" })],
  })
  assert.equal(decisions.length, 1)
  assert.deepEqual(decisions[0], { kind: "unlink", xeroInvoiceId: "inv-dead", status: "DELETED" })
})

test("XERO-2: invoiceCarriesPo counts only a PO token with digits in the Reference", () => {
  const yes = [
    "Penfolds - Grange Hero Burst 1 FY27 (PENFOLD018) | PO 1005369",
    "Treasurey Wine Estates - Pepper Jack and Squealing Pig Planning Fee | PO# 1018151",
    "Penfolds PR Influencer | PO#983905",
    "Penfolds - PENFOLD015-  Bin 707 amplification | PO1017399",
    "Radio_Awareness Boost 2026 | CHALLEN001 | C120-PO-1002167",
    "MNET/PO-08202500044",
    "BOSS AUTOMOTIVE FY26 | BOSS002 | PO C25-BOSS-0007",
  ]
  for (const ref of yes) assert.equal(invoiceCarriesPo(ref), true, ref)
  const no = [
    // A bare number segment is not a PO (narrowed 29 Oct 2026).
    "Penfolds - Father's Day 2027 (PENFOLD016) | 1010438",
    "Penfolds - Grange Hero FY2027 (PENFOLD018) |\u00a0 1005369",
    "Penfolds - Collection Release FY2027 (PENFOLD015) | 1005380",
    "Mitchelton Winery - Annual Performance | 001001",
    "MoliCare - Annual Performance | hartm001",
    "Curatif - FY27 Curatif004",
    "BIC - Social Boosting Upweight (BICAU003)",
    "Digital Performance | Legal001 | PO TBC",
    "Pop-up Sponsorship Report | golf005",
    "",
    null,
  ]
  for (const ref of no) assert.equal(invoiceCarriesPo(ref), false, String(ref))
})

test("XERO-2: an invoice with a PO token matches the exact billing month only", () => {
  const pf18: MbaMaster[] = [{ id: 2, mba_number: "PENFOLD018" }]
  // PENFOLD018: INV-1501 issued 30 Sep with PO 1005369 was matched to the October record.
  const out = matchXeroInvoicesToAppRecords({
    masters: pf18,
    invoices: [
      invoice({
        xeroInvoiceId: "inv-1501",
        issueDate: "2026-09-30",
        referenceRaw: "Penfolds - Grange Hero Burst 1 FY27 (PENFOLD018) | PO 1005369",
        subTotalCents: 726_985,
      }),
    ],
    records: [record({ invoiceKey: "media:PENFOLD018:2026-10", mbaNumber: "PENFOLD018", billingMonth: "2026-10", approvedAmountCents: 679_263 })],
  })
  assert.deepEqual(out[0], { kind: "suggestion", xeroInvoiceId: "inv-1501", reason: "token_no_record_in_window" })

  const pf16: MbaMaster[] = [{ id: 3, mba_number: "PENFOLD016" }]
  const exact = matchXeroInvoicesToAppRecords({
    masters: pf16,
    invoices: [
      invoice({ xeroInvoiceId: "inv-aug", issueDate: "2026-08-26", referenceRaw: "(PENFOLD016) | PO 1010438", subTotalCents: 457_143 }),
    ],
    records: [
      record({ invoiceKey: "media:PENFOLD016:2026-08", mbaNumber: "PENFOLD016", billingMonth: "2026-08", approvedAmountCents: 457_143 }),
      record({ invoiceKey: "media:PENFOLD016:2026-09", mbaNumber: "PENFOLD016", billingMonth: "2026-09", approvedAmountCents: 457_143 }),
    ],
  })
  assert.equal(exact[0]?.kind, "stamp")
  if (exact[0]?.kind === "stamp") assert.deepEqual(exact[0].invoiceKeys, ["media:PENFOLD016:2026-08"])
})

test("XERO-2: a bare number segment keeps the plus or minus one month window (PENFOLD016 Sep shape)", () => {
  const pf16: MbaMaster[] = [{ id: 3, mba_number: "PENFOLD016" }]
  const out = matchXeroInvoicesToAppRecords({
    masters: pf16,
    invoices: [
      invoice({
        xeroInvoiceId: "inv-1422",
        issueDate: "2026-08-26",
        referenceRaw: "Penfolds - Father's Day 2027 (PENFOLD016) | 1010438",
        subTotalCents: 457_143,
      }),
    ],
    records: [record({ invoiceKey: "media:PENFOLD016:2026-09", mbaNumber: "PENFOLD016", billingMonth: "2026-09", approvedAmountCents: 1_424_572 })],
  })
  assert.equal(out[0]?.kind, "stamp")
})

test("XERO-2: an invoice with no PO keeps the plus or minus one month window (hartm001 shape)", () => {
  const h: MbaMaster[] = [{ id: 3, mba_number: "hartm001" }]
  const out = matchXeroInvoicesToAppRecords({
    masters: h,
    invoices: [
      invoice({ xeroInvoiceId: "inv-1484", issueDate: "2026-09-30", referenceRaw: "MoliCare - Annual Performance | hartm001", subTotalCents: 5_805_773 }),
    ],
    records: [record({ invoiceKey: "media:hartm001:2026-10", mbaNumber: "hartm001", billingMonth: "2026-10", approvedAmountCents: 5_329_205 })],
  })
  assert.equal(out[0]?.kind, "stamp")
})

test("XERO-2: client-linked invoices with a PO and no MBA token also need the exact month", () => {
  const out = matchXeroInvoicesToAppRecords({
    masters,
    invoices: [invoice({ xeroInvoiceId: "inv-c", issueDate: "2026-08-31", referenceRaw: "Media Buy 1 | PO 1005377" })],
    records: [record({ invoiceKey: "media:PENFOLD018:2026-09", billingMonth: "2026-09" })],
  })
  assert.equal(out[0]?.kind, "suggestion")
  const noPo = matchXeroInvoicesToAppRecords({
    masters,
    invoices: [invoice({ xeroInvoiceId: "inv-d", issueDate: "2026-08-31", referenceRaw: "Media Buy 1" })],
    records: [record({ invoiceKey: "media:PENFOLD018:2026-09", billingMonth: "2026-09" })],
  })
  assert.equal(noPo[0]?.kind, "stamp")
})

test("in-arrears hand fix: a cleared October row comes back unless matched_by is manual (hartm001 shape)", () => {
  const h: MbaMaster[] = [{ id: 3, mba_number: "hartm001" }]
  const invoices = [
    invoice({ xeroInvoiceId: "inv-1447", issueDate: "2026-08-31", referenceRaw: "MoliCare - Annual Performance | hartm001", subTotalCents: 6_226_755 }),
    invoice({ xeroInvoiceId: "inv-1484", issueDate: "2026-09-30", referenceRaw: "MoliCare - Annual Performance | hartm001", subTotalCents: 5_805_773 }),
  ]
  const sep = record({ invoiceKey: "media:hartm001:2026-09", mbaNumber: "hartm001", billingMonth: "2026-09", approvedAmountCents: 5_805_773, matchedBy: "auto" })
  const octCleared = record({ invoiceKey: "media:hartm001:2026-10", mbaNumber: "hartm001", billingMonth: "2026-10", approvedAmountCents: 5_329_205, matchedBy: null })

  // Cleared to NULL: the next run stamps INV-1484 on October again.
  const again = matchXeroInvoicesToAppRecords({ masters: h, invoices, records: [sep, octCleared] })
  const inv1484 = again.find((d) => d.xeroInvoiceId === "inv-1484")
  assert.equal(inv1484?.kind, "stamp")
  if (inv1484?.kind === "stamp") assert.deepEqual(inv1484.invoiceKeys, ["media:hartm001:2026-10"])

  // Cleared with matched_by = manual: October is held off auto, INV-1484 is a suggestion.
  const held = matchXeroInvoicesToAppRecords({ masters: h, invoices, records: [sep, { ...octCleared, matchedBy: "manual" }] })
  assert.equal(held.find((d) => d.xeroInvoiceId === "inv-1484")?.kind, "suggestion")
})
