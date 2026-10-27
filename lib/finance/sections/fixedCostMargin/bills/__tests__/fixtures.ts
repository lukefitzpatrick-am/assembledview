/**
 * Real-shaped Xero bills (xero_ap_bills.line_items_json, 27 Oct 2026),
 * anonymised: client, campaign and MBA names replaced; media owners,
 * amounts, tax, dates and line layout kept.
 */

import type { RawBillRow } from "../parse.js"
import type { BillPlanLine } from "../match.js"

/** Channel Factory, Inclusive, one placement (shape of CF 74242-8). */
export const CF_BILL_AUG: RawBillRow = {
  billId: 7059,
  xeroInvoiceId: "cf-aug",
  invoiceNumber: "74242-8",
  referenceRaw: "",
  contactName: "Channel Factory Australia Pty Ltd",
  status: "AUTHORISED",
  currency: "AUD",
  issueDate: "2026-08-31",
  lineAmountTypes: "Inclusive",
  lineItems: [
    {
      Description:
        "Campaign Name: Assembled Media VIC Krusty - Brand AU GO Q3-Q4'26 OP072970 Advertiser: Brand Krusty Krab",
      LineAmount: null,
      TaxAmount: null,
    },
    { Description: "SkippablePL267346", LineAmount: 6179.17, TaxAmount: 561.74 },
  ],
}

/** Channel Factory, Exclusive, a 7.5% fee placement not in the CF daily file. */
export const CF_FEE_BILL: RawBillRow = {
  billId: 7062,
  xeroInvoiceId: "cf-fee",
  invoiceNumber: "78754-8",
  referenceRaw: "",
  contactName: "Channel Factory Australia Pty Ltd",
  status: "AUTHORISED",
  currency: "AUD",
  issueDate: "2026-08-31",
  lineAmountTypes: "Exclusive",
  lineItems: [
    {
      Description: "Campaign Name: Assembled Media VIC Krusty Agri DL August Q3'26 OP077482Advertiser",
      LineAmount: null,
    },
    { Description: "7.5% DL FeePL284494", LineAmount: 301.84, TaxAmount: 30.18 },
  ],
}

/** AA bill dated 30 Sep carrying an Aug week and a Sep continuation line (shape of 108215). */
export const AA_TV_BILL: RawBillRow = {
  billId: 10944,
  xeroInvoiceId: "aa-tv",
  invoiceNumber: "Krusty Krab | KRUSTY001 | 108215",
  referenceRaw: "",
  contactName: "Advertising Associates",
  status: "AUTHORISED",
  currency: "AUD",
  issueDate: "2026-09-30",
  lineAmountTypes: "Exclusive",
  lineItems: [
    {
      Description: "National National Seven Network\n\nSun-Sat 23/08/2026 06:00-00:00",
      LineAmount: 15517.24,
      TaxAmount: 1551.72,
      Tracking: [
        { Name: "Media", Option: "D.Outdoor" },
        { Name: "Client/Campaign", Option: "Krusty - Hero FY2027 (KRUSTY001)" },
      ],
    },
    { Description: "Sun-Sat 06/09/2026 06:00-00:00", LineAmount: 134482.76, TaxAmount: 13448.28 },
  ],
}

/** AA bill with no MBA anywhere; Nova media, production, talent and hot read (shape of 108320). */
export const AA_NO_MBA_BILL: RawBillRow = {
  billId: 10995,
  xeroInvoiceId: "aa-nomba",
  invoiceNumber: "Krusty Engage - Brand | 108320",
  referenceRaw: "",
  contactName: "Advertising Associates",
  status: "AUTHORISED",
  currency: "AUD",
  issueDate: "2026-09-30",
  lineAmountTypes: "Exclusive",
  lineItems: [
    {
      Description: "National National NOVA Podcasts\n\nSun-Sat 09/08/2026 06:00-00:00 Package",
      LineAmount: 485.5,
      Tracking: [{ Name: "Client/Campaign", Option: "Krusty Engage Australia" }],
    },
    { Description: "National National Nova Production\n\n09/08/2026 06:00-00:00 Talent", LineAmount: 1900 },
    { Description: "National National Nova Production\n\n06/09/2026 06:00-00:00 Hot Read", LineAmount: 750 },
  ],
}

/** AA bill, MBA only in a per-line tracking option, two MBAs on one bill (shape of 108201). */
export const AA_TRACKING_BILL: RawBillRow = {
  billId: 10955,
  xeroInvoiceId: "aa-track",
  invoiceNumber: "Krusty Engineering | 108201",
  referenceRaw: "",
  contactName: "Advertising Associates",
  status: "PAID",
  currency: "AUD",
  issueDate: "2026-09-30",
  lineAmountTypes: "Exclusive",
  lineItems: [
    {
      Description: "Regional Victoria Weekly Times\n\nWednesday 16/09/2026 Early General News",
      LineAmount: 3870,
      Tracking: [{ Name: "Client/Campaign", Option: "Krusty - FY27 Agriculture | KRUSTY010" }],
    },
    {
      Description: "Regional Queensland Queensland Country Life\n\nThursday 17/09/2026 Early General News",
      LineAmount: 2134,
      Tracking: [{ Name: "Client/Campaign", Option: "Krusty - FY27 Automotive | KRUSTY011" }],
    },
  ],
}

/** Older AA layout: MBA on the header line ("Purchase Order ..."), DRAFT status. */
export const AA_HEADER_DRAFT_BILL: RawBillRow = {
  billId: 7250,
  xeroInvoiceId: "aa-draft",
  invoiceNumber: "Father's Day 2027 | 26471",
  referenceRaw: "",
  contactName: "Advertising Associates",
  status: "DRAFT",
  currency: "AUD",
  issueDate: "2026-08-31",
  lineAmountTypes: "Exclusive",
  lineItems: [
    { Description: "National National Broadsheet\n\nSun-Sat 16/08/2026 16/08/2026 - 16/08/2026", LineAmount: 19250 },
    {
      Description: "Client: Krusty Krab\nProduct: Krusty Krab\n\nMedia Type: Outdoor\nSchedule:\nPurchase Order\nKRUSTY016",
      LineAmount: null,
    },
  ],
}

/** Direct Broadsheet bill (commission deducted on the bill, no MBA). */
export const DIRECT_BROADSHEET_BILL: RawBillRow = {
  billId: 2400,
  xeroInvoiceId: "direct-bs",
  invoiceNumber: "7894 - Krusty - KRUSTY016 - Fathers Day",
  referenceRaw: "",
  contactName: "Broadsheet Media Pty Ltd",
  status: "PAID",
  currency: "AUD",
  issueDate: "2026-07-31",
  lineAmountTypes: "Exclusive",
  lineItems: [
    { Description: "Commissionable", LineAmount: 6000 },
    { Description: "Less: Agency Commission", LineAmount: -600 },
  ],
}

export const KNOWN_MBAS = new Set(["krusty001", "krusty010", "krusty011", "krusty016"])

export const MBA_CLIENTS = new Map([
  ["krusty001", { clientId: 53, clientName: "Krusty Krab" }],
  ["krusty010", { clientId: 53, clientName: "Krusty Krab" }],
  ["krusty011", { clientId: 53, clientName: "Krusty Krab" }],
  ["krusty016", { clientId: 53, clientName: "Krusty Krab" }],
])

function planLine(over: Partial<BillPlanLine> & { billed: Record<string, number> }): BillPlanLine {
  return {
    mbaNumber: "krusty001",
    lineItemId: "krusty001tv1",
    clientId: 53,
    clientName: "Krusty Krab",
    publisher: "Seven",
    billingAgency: "advertising associates",
    inReport: true,
    ...over,
    billedByMonth: new Map(Object.entries(over.billed)),
  }
}

/** Plan lines shaped like the live PENFOLD018 / BOSS010 / BOSS011 / PENFOLD016 lines. */
export const PLAN_LINES: BillPlanLine[] = [
  planLine({ lineItemId: "krusty001tv1", billed: { "2026-08": 1551724, "2026-09": 13448276 } }),
  planLine({ lineItemId: "krusty001dv1", billed: { "2026-08": 517241, "2026-09": 4482759 } }),
  planLine({ lineItemId: "krusty001pv1", publisher: "Channel Factory", billingAgency: "assembled media", billed: { "2026-08": 550993 } }),
  planLine({ mbaNumber: "krusty010", lineItemId: "krusty010np1", publisher: "News Corp", inReport: false, billed: { "2026-09": 387000, "2026-11": 387000 } }),
  planLine({ mbaNumber: "krusty010", lineItemId: "krusty010np2", publisher: "News Corp", inReport: false, billed: { "2026-11": 774000 } }),
  planLine({ mbaNumber: "krusty011", lineItemId: "krusty011np1", publisher: "Australian Community Media", inReport: false, billed: { "2026-10": 218400 } }),
  planLine({ mbaNumber: "krusty011", lineItemId: "krusty011np2", publisher: "Australian Community Media", inReport: false, billed: { "2026-09": 213400, "2026-10": 213400 } }),
  planLine({ mbaNumber: "krusty016", lineItemId: "krusty016dd2", publisher: "Broadsheet", billed: { "2026-08": 420000 } }),
  planLine({ mbaNumber: "krusty016", lineItemId: "krusty016dd4", publisher: "Broadsheet", billed: { "2026-08": 735000 } }),
]

export const PUBLISHERS = [
  { id: 29, publisher_name: "Seven", publisherid: "Network Seven", billingagency: "advertising associates" },
  { id: 26, publisher_name: "News Corp", publisherid: "News Corp", billingagency: "advertising associates" },
  { id: 27, publisher_name: "Australian Community Media", publisherid: "ACM", billingagency: "advertising associates" },
  { id: 20, publisher_name: "Nova", publisherid: "Nova", billingagency: "advertising associates" },
  { id: 33, publisher_name: "Broadsheet", publisherid: "Broadsheet", billingagency: "advertising associates" },
  { id: 47, publisher_name: "Channel Factory", publisherid: "chfact", billingagency: "assembled media" },
  { id: 36, publisher_name: "Listnr", publisherid: "listnr", billingagency: "assembled media" },
  { id: 31, publisher_name: "Foxtel Media ", publisherid: "foxtel", billingagency: "advertising associates" },
  { id: 2, publisher_name: "DV360", publisherid: "dav360", billingagency: "assembled media" },
]
