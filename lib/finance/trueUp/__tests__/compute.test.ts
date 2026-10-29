import assert from "node:assert/strict"
import test from "node:test"

import {
  TRUE_UP_THRESHOLD_CENTS,
  attributeInvoiceLines,
  buildTrueUpReport,
  classifyXeroLine,
  defaultTrueUpAsOf,
  financialYearStart,
  invoiceCountState,
  lineExGstCents,
  scheduleCentsFromRow,
  type TrueUpInvoiceSqlRow,
  type TrueUpMatchedRecordSqlRow,
  type TrueUpPlanSqlRow,
  type TrueUpScheduleSqlRow,
} from "../compute.js"
import { INVOICES, MATCHED_RECORDS, PLANS, SCHEDULE } from "./fixtures.js"

function report(asOfMonth: string, fromMonth = financialYearStart(asOfMonth)) {
  return buildTrueUpReport({
    asOfMonth,
    fromMonth,
    plans: PLANS,
    schedule: SCHEDULE,
    invoices: INVOICES,
    matchedRecords: MATCHED_RECORDS,
  })
}

function row(r: ReturnType<typeof report>, mba: string) {
  const found = r.rows.find((x) => x.mbaNumber === mba)
  assert.ok(found, `row for ${mba}`)
  return found
}

function monthGaps(r: ReturnType<typeof report>, mba: string, component: "fee" | "adserving") {
  return Object.fromEntries(row(r, mba).months.map((m) => [m.month, m.components[component].gap]))
}

test("reproduces the 29 Oct reconciliation, July to September, for fee and ad serving", () => {
  const r = report("2026-09")
  assert.equal(r.fromMonth, "2026-07")

  // golf025: fee -1,638.93 (Jul -4.39, Aug -1,039.15, Sep -595.39), ad serving +48.78.
  assert.deepEqual(monthGaps(r, "golf025", "fee"), { "2026-07": -439, "2026-08": -103915, "2026-09": -59539 })
  assert.deepEqual(monthGaps(r, "golf025", "adserving"), { "2026-07": 0, "2026-08": -42, "2026-09": 4920 })
  assert.equal(row(r, "golf025").components.fee.gap, -163893)
  assert.equal(row(r, "golf025").components.adserving.gap, 4878)

  // PGAAUS015: fee -1,906.31 (Jul +0.05, Aug -615.78, Sep -1,290.58), ad serving +12.81.
  assert.deepEqual(monthGaps(r, "PGAAUS015", "fee"), { "2026-07": 5, "2026-08": -61578, "2026-09": -129058 })
  assert.deepEqual(monthGaps(r, "PGAAUS015", "adserving"), { "2026-07": 0, "2026-08": 1826, "2026-09": -545 })
  assert.equal(row(r, "PGAAUS015").components.fee.gap, -190631)
  assert.equal(row(r, "PGAAUS015").components.adserving.gap, 1281)

  // BICAU006: September fee -968.78, ad serving -71.45 (before the October catch-up).
  assert.equal(row(r, "BICAU006").components.fee.gap, -96878)
  assert.equal(row(r, "BICAU006").components.adserving.gap, -7145)
})

test("statuses and suggestions for the pinned MBAs at September", () => {
  const r = report("2026-09")
  const golf = row(r, "golf025")
  assert.equal(golf.components.fee.status, "gap")
  assert.equal(golf.components.fee.suggestion, "Spread the charge over the remaining months")
  // +48.78 does not pay for October's 149.30: a credit, not billed ahead.
  assert.equal(golf.components.adserving.status, "gap")
  assert.deepEqual(golf.components.adserving.coveredMonths, [])
  assert.equal(golf.status, "gap")
  assert.deepEqual(row(r, "golf025").components.fee.remainingMonths, ["2026-10", "2026-11", "2026-12"])

  // Invoice numbers per month come through.
  const sep = row(r, "golf025").months.find((m) => m.month === "2026-09")!
  assert.deepEqual(sep.invoiceNumbers, ["INV-1477"])
})

test("October drafts are provisional, shown and never counted (decision 3)", () => {
  const r = report("2026-10")
  const bic = row(r, "BICAU006")
  const oct = bic.months.find((m) => m.month === "2026-10")!
  assert.equal(oct.components.fee.invoiced, 0)
  assert.equal(oct.components.fee.provisional, 1760432)
  assert.deepEqual(oct.provisionalInvoiceNumbers, ["INV-1519"])
  assert.equal(bic.hasProvisional, true)
  // Counted only: September invoice against September plus October schedule.
  assert.equal(bic.components.fee.gap, 721263 - (818141 + 845412))
  assert.equal(r.provisionalInvoices, 3)
})

test("if the October drafts were sent, BICAU006 is billed ahead for November exactly", () => {
  const sent = INVOICES.map((inv) =>
    inv.status === "DRAFT" ? { ...inv, status: "AUTHORISED", sent_to_contact: "true" } : inv,
  )
  const r = buildTrueUpReport({
    asOfMonth: "2026-10",
    fromMonth: "2026-07",
    plans: PLANS,
    schedule: SCHEDULE,
    invoices: sent,
    matchedRecords: MATCHED_RECORDS,
  })
  const bic = row(r, "BICAU006")
  // 29 Oct reconciliation section B: fee +8,181.42, ad serving +603.45 = November's schedule.
  assert.equal(bic.components.fee.gap, 818142)
  assert.equal(bic.components.fee.status, "billed_ahead")
  assert.deepEqual(bic.components.fee.coveredMonths, ["2026-11"])
  assert.equal(bic.components.adserving.gap, 60345)
  assert.equal(bic.components.adserving.status, "billed_ahead")
  // golf025 to October: fee -2,443.48, ad serving -17.60 (section A).
  assert.equal(row(r, "golf025").components.fee.gap, -244348)
  assert.equal(row(r, "golf025").components.adserving.gap, -1760)
  // PGAAUS015 to October: fee -2,461.09, ad serving +307.06.
  assert.equal(row(r, "PGAAUS015").components.fee.gap, -246109)
  assert.equal(row(r, "PGAAUS015").components.adserving.gap, 30706)
})

test("line classes: fee, ad serving, production with or without a space, out-of-scope codes", () => {
  assert.equal(classifyXeroLine({ ItemCode: "Service", AccountCode: "21403" }), "fee")
  assert.equal(classifyXeroLine({ ItemCode: null, AccountCode: "21403" }), "fee")
  assert.equal(classifyXeroLine({ ItemCode: "T.Adserving", AccountCode: "21404" }), "adserving")
  assert.equal(classifyXeroLine({ ItemCode: "G. Production", AccountCode: "212" }), "production")
  assert.equal(classifyXeroLine({ ItemCode: "D.Production", AccountCode: "214" }), "production")
  assert.equal(classifyXeroLine({ ItemCode: "SOW", AccountCode: "218" }), "excluded")
  assert.equal(classifyXeroLine({ ItemCode: "Retainer", AccountCode: "218" }), "excluded")
  assert.equal(classifyXeroLine({ ItemCode: "D.SEO", AccountCode: "230" }), "excluded")
  assert.equal(classifyXeroLine({ ItemCode: "G. Display", AccountCode: "212" }), "media")
})

test("ex GST: inclusive invoices take the tax out of the line amount", () => {
  assert.equal(lineExGstCents({ LineAmount: 110, TaxAmount: 10 }, "Inclusive"), 10000)
  assert.equal(lineExGstCents({ LineAmount: 100, TaxAmount: 10 }, "Exclusive"), 10000)
  assert.equal(lineExGstCents({ LineAmount: "995.61", TaxAmount: "99.56" }, "Exclusive"), 99561)
})

test("count state: sent and approved count; drafts, unsent and voided do not", () => {
  assert.equal(invoiceCountState({ status: "PAID", sent_to_contact: "true", invoice_type: "ACCREC" }), "counted")
  assert.equal(invoiceCountState({ status: "AUTHORISED", sent_to_contact: true, invoice_type: "ACCREC" }), "counted")
  assert.equal(invoiceCountState({ status: "AUTHORISED", sent_to_contact: "false", invoice_type: "ACCREC" }), "provisional")
  assert.equal(invoiceCountState({ status: "DRAFT", sent_to_contact: null, invoice_type: "ACCREC" }), "provisional")
  assert.equal(invoiceCountState({ status: "VOIDED", sent_to_contact: "true", invoice_type: "ACCREC" }), "ignored")
  assert.equal(invoiceCountState({ status: "AUTHORISED", sent_to_contact: null, invoice_type: "ACCRECCREDIT" }), "counted")
})

const plan = (mba: string, end = "2026-12-31", id = 1): TrueUpPlanSqlRow => ({
  master_id: id,
  mba_number: mba,
  client_id: 9,
  mp_client_name: "Test client",
  campaign_name: "Test",
  campaign_status: "booked",
  campaign_end_date: end,
  version_id: 100 + id,
  version_number: 1,
})

const sched = (mba: string, month: string, fee: number, media = 0): TrueUpScheduleSqlRow => ({
  mba_number: mba,
  month,
  fee_cents: fee,
  adserving_cents: 0,
  media_cents: media,
  service_production_cents: 0,
  line_production_cents: 0,
  client_pays_media_cents: 0,
})

const inv = (
  id: string,
  issue: string,
  mba: string | null,
  feeDollars: number,
  extra: Partial<TrueUpInvoiceSqlRow> = {},
): TrueUpInvoiceSqlRow => ({
  xero_invoice_id: id,
  invoice_number: `INV-${id}`,
  status: "AUTHORISED",
  issue_date: issue,
  mba_number: mba,
  reference_raw: mba ?? "",
  sent_to_contact: "true",
  invoice_type: "ACCREC",
  line_amount_types: "Exclusive",
  line_items_json: [{ ItemCode: "Service", AccountCode: "21403", LineAmount: feeDollars, TaxAmount: 0 }],
  ...extra,
})

test("a hand-assigned Clients billing record sets the month; an automatic match names the MBA only", () => {
  const records: TrueUpMatchedRecordSqlRow[] = [
    { xero_invoice_id: "a", invoice_key: "media:mit001:2026-09", mba_number: "mit001", billing_month: "2026-09", matched_by: "manual" },
    { xero_invoice_id: "c", invoice_key: "media:mit001:2026-09", mba_number: "mit001", billing_month: "2026-09", matched_by: "auto" },
  ]
  const out = attributeInvoiceLines({
    invoices: [
      inv("a", "2026-08-31", "mit001", 1050),
      inv("b", "2026-07-31", "mit001", 1050),
      inv("c", "2026-08-31", null, 1050),
    ],
    matchedRecords: records,
    masters: [{ id: 1, mba_number: "mit001" }],
    publishedMbaKeys: new Set(["mit001"]),
  })
  assert.deepEqual(
    out.lines.map((l) => [l.invoiceNumber, l.mbaKey, l.month, l.source]),
    [
      ["INV-a", "mit001", "2026-09", "matched_record"],
      ["INV-b", "mit001", "2026-07", "invoice_mba"],
      ["INV-c", "mit001", "2026-08", "matched_record"],
    ],
  )
})

test("line tracking finds the MBA when the invoice has none; otherwise unattributed", () => {
  const tracked = inv("t", "2026-08-04", null, 500, {
    line_items_json: [
      {
        ItemCode: "Service",
        AccountCode: "21403",
        LineAmount: 500,
        TaxAmount: 50,
        Tracking: [{ Name: "Client/Campaign", Option: "jayco017" }],
      },
    ],
  })
  const out = attributeInvoiceLines({
    invoices: [tracked, inv("u", "2026-08-04", null, 300), inv("n", "2026-08-04", "zzz999", 200)],
    matchedRecords: [],
    masters: [{ id: 7, mba_number: "jayco017" }],
    publishedMbaKeys: new Set(["jayco017"]),
  })
  assert.deepEqual(out.lines.map((l) => [l.invoiceNumber, l.mbaKey, l.source]), [["INV-t", "jayco017", "line_tracking"]])
  assert.deepEqual(
    out.unattributed.map((u) => [u.invoiceNumber, u.reason]),
    [
      ["INV-u", "no_mba"],
      ["INV-n", "mba_not_published"],
    ],
  )
})

test("credit notes reduce the invoiced amount", () => {
  const r = buildTrueUpReport({
    asOfMonth: "2026-08",
    fromMonth: "2026-07",
    plans: [plan("abc001")],
    schedule: [sched("abc001", "2026-07", 100000), sched("abc001", "2026-08", 100000), sched("abc001", "2026-09", 100000)],
    invoices: [
      inv("1", "2026-07-31", "abc001", 1000),
      inv("2", "2026-08-31", "abc001", 1200),
      inv("3", "2026-08-31", "abc001", 200, { invoice_type: "ACCRECCREDIT", sent_to_contact: null }),
    ],
    matchedRecords: [],
  })
  assert.equal(r.rows[0]!.components.fee.gap, 0)
  assert.equal(r.rows[0]!.components.fee.status, "matches")
})

test("$1 threshold: 99 cents matches, $1 is flagged (decision 4)", () => {
  const base = {
    asOfMonth: "2026-07",
    fromMonth: "2026-07",
    plans: [plan("abc001")],
    schedule: [sched("abc001", "2026-07", 100000), sched("abc001", "2026-08", 100000), sched("abc001", "2026-09", 100000)],
    matchedRecords: [],
  }
  const under = buildTrueUpReport({ ...base, invoices: [inv("1", "2026-07-31", "abc001", 999.01)] })
  assert.equal(under.rows[0]!.components.fee.gap, -99)
  assert.equal(under.rows[0]!.components.fee.status, "matches")
  const over = buildTrueUpReport({ ...base, invoices: [inv("1", "2026-07-31", "abc001", 999)] })
  assert.equal(over.rows[0]!.components.fee.gap, -TRUE_UP_THRESHOLD_CENTS)
  assert.equal(over.rows[0]!.components.fee.status, "gap")
  assert.equal(over.rows[0]!.components.fee.suggestion, "Spread the charge over the remaining months")
})

test("no invoice, ended and schedule incomplete", () => {
  const r = buildTrueUpReport({
    asOfMonth: "2026-09",
    fromMonth: "2026-07",
    plans: [plan("none01", "2026-12-31", 1), plan("ended1", "2026-08-15", 2), plan("nofee1", "2026-12-31", 3)],
    schedule: [
      sched("none01", "2026-08", 50000),
      sched("ended1", "2026-07", 100000),
      sched("ended1", "2026-08", 100000),
      sched("nofee1", "2026-08", 0, 900000),
      sched("nofee1", "2026-10", 0, 900000),
    ],
    invoices: [
      inv("e1", "2026-07-31", "ended1", 1100),
      inv("e2", "2026-08-31", "ended1", 1100),
      inv("n1", "2026-08-31", "nofee1", 1950, {
        line_items_json: [
          { ItemCode: "D.Social", AccountCode: "214", LineAmount: 9000, TaxAmount: 0 },
          { ItemCode: "Service", AccountCode: "21403", LineAmount: 1950, TaxAmount: 0 },
        ],
      }),
    ],
    matchedRecords: [],
  })
  const by = (m: string) => r.rows.find((x) => x.mbaNumber === m)!
  assert.equal(by("none01").components.fee.status, "no_invoice")
  assert.equal(by("ended1").components.fee.status, "ended")
  assert.equal(by("ended1").components.fee.suggestion, "Campaign ended. Raise a one-off credit")
  assert.equal(by("nofee1").components.fee.status, "schedule_incomplete")
  assert.equal(by("nofee1").components.media.status, "matches")
  assert.equal(r.totals.mbasNeedingAction, 3)
})

test("schedule cents: production from both sources, client-pays media left out", () => {
  const c = scheduleCentsFromRow({
    mba_number: "x",
    month: "2026-08",
    fee_cents: "100",
    adserving_cents: "20",
    media_cents: "10000",
    service_production_cents: "500",
    line_production_cents: "0",
    client_pays_media_cents: "2000",
  })
  assert.deepEqual(c, { fee: 100, adserving: 20, production: 500, media: 7500, productionCountedTwice: false })
})

test("default months: last month as of, financial year from July", () => {
  assert.equal(defaultTrueUpAsOf("2026-11-02"), "2026-10")
  assert.equal(defaultTrueUpAsOf("2027-01-02"), "2026-12")
  assert.equal(financialYearStart("2026-10"), "2026-07")
  assert.equal(financialYearStart("2027-03"), "2026-07")
  assert.equal(financialYearStart("2026-07"), "2026-07")
})
