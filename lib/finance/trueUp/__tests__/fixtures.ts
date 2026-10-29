/**
 * Live rows for golf025, PGAAUS015 and BICAU006 (plus golf012), read on
 * 29 Oct 2026 with the loader's own SQL. The expected gaps come from the
 * 29 Oct fee reconciliation (RECON-AV-fees-xero-2026-10-29.md), July to
 * September, which every later true-up must keep reproducing.
 */

import type {
  TrueUpInvoiceSqlRow,
  TrueUpMatchedRecordSqlRow,
  TrueUpPlanSqlRow,
  TrueUpScheduleSqlRow,
  TrueUpXeroLine,
} from "../compute.js"

function L(code: string | null, account: string | null, amount: number, tax: number, campaign: string, media = code): TrueUpXeroLine {
  return {
    ItemCode: code,
    AccountCode: account,
    LineAmount: amount,
    TaxAmount: tax,
    Tracking: [
      { Name: "Media", Option: media },
      { Name: "Client/Campaign", Option: campaign },
    ],
  }
}

const GOLF025 = "Golf Australia - Australian Open FY27 July-December (golf025)"
const GOLF012 = "Golf Australia - golf012"
const PGA = "PGA Australia - PGA Champs FY27 (PGAAUS015)"
const BIC = "BIC Flex5 - Impressively Simpl | BICAU006"

export const PLANS: TrueUpPlanSqlRow[] = [
  { master_id: 171, mba_number: "golf012", client_id: 19, mp_client_name: "Golf Australia", campaign_name: "Australian Open 2026_April-June Awareness", campaign_status: "approved", campaign_end_date: "2026-06-30", version_id: 821, version_number: 4 },
  { master_id: 255, mba_number: "BICAU006", client_id: 17, mp_client_name: "BIC", campaign_name: "BIC Flex5 - Impressively Simple.", campaign_status: "approved", campaign_end_date: "2026-11-30", version_id: 16785, version_number: 24 },
  { master_id: 243, mba_number: "PGAAUS015", client_id: 20, mp_client_name: "PGA Australia", campaign_name: "PGA Champs FY27", campaign_status: "approved", campaign_end_date: "2026-11-29", version_id: 19608, version_number: 39 },
  { master_id: 244, mba_number: "golf025", client_id: 19, mp_client_name: "Golf Australia", campaign_name: "Australian Open FY27", campaign_status: "approved", campaign_end_date: "2026-12-06", version_id: 19625, version_number: 40 },
]

function S(mba: string, month: string, fee: number, ads: number, media: number, lineProd = 0): TrueUpScheduleSqlRow {
  return {
    mba_number: mba,
    month,
    fee_cents: String(fee),
    adserving_cents: String(ads),
    media_cents: String(media),
    service_production_cents: "0",
    line_production_cents: String(lineProd),
    client_pays_media_cents: "0",
  }
}

export const SCHEDULE: TrueUpScheduleSqlRow[] = [
  S("BICAU006", "2026-09", 818141, 60343, 7363271),
  S("BICAU006", "2026-10", 845412, 62355, 10608715),
  S("BICAU006", "2026-11", 818142, 60345, 7363274),
  S("golf012", "2026-04", 0, 0, 400000),
  S("golf012", "2026-05", 0, 0, 400000),
  S("golf012", "2026-06", 0, 0, 400000),
  S("golf025", "2026-04", 100000, 0, 400000),
  S("golf025", "2026-05", 100000, 0, 400000),
  S("golf025", "2026-06", 100000, 0, 400000),
  S("golf025", "2026-07", 100000, 0, 400000),
  S("golf025", "2026-08", 226975, 42, 913614),
  S("golf025", "2026-09", 240541, 623, 3190280),
  S("golf025", "2026-10", 351234, 14930, 4783205),
  S("golf025", "2026-11", 346592, 30280, 14713946),
  S("golf025", "2026-12", 34658, 3123, 3181901),
  S("PGAAUS015", "2026-04", 28000, 0, 1612000),
  S("PGAAUS015", "2026-05", 57000, 0, 228000),
  S("PGAAUS015", "2026-06", 75000, 0, 300000),
  S("PGAAUS015", "2026-07", 85975, 0, 343900),
  S("PGAAUS015", "2026-08", 157900, 0, 631600),
  S("PGAAUS015", "2026-09", 264325, 545, 1532301),
  S("PGAAUS015", "2026-10", 635655, 13311, 5416097, 163158),
  S("PGAAUS015", "2026-11", 542145, 122121, 12764472, 136842),
]

function I(
  id: string,
  number: string,
  status: string,
  issue: string,
  mba: string | null,
  lines: TrueUpXeroLine[],
  sent: string | null = status === "DRAFT" ? null : "true",
): TrueUpInvoiceSqlRow {
  return {
    xero_invoice_id: id,
    invoice_number: number,
    status,
    issue_date: issue,
    mba_number: mba,
    reference_raw: mba ? `ref | ${mba}` : "",
    sent_to_contact: sent,
    invoice_type: "ACCREC",
    line_amount_types: "Exclusive",
    line_items_json: lines,
  }
}

export const INVOICES: TrueUpInvoiceSqlRow[] = [
  I("c493a45e", "INV-1345", "PAID", "2026-06-30", "golf012", [
    L("D.Social", "214", 4000, 400, GOLF012),
    L("Service", "21403", 1000, 100, GOLF012),
  ]),
  I("f270da4e", "INV-1372", "PAID", "2026-06-30", "golf012", [L("SOW", "218", 3600, 360, GOLF012, "D.Social")]),
  I("a8a05206", "INV-1373", "PAID", "2026-07-01", "golf012", [L("SOW", "218", 18680, 1868, GOLF012, "D.Social")]),
  I("60f96030", "INV-1380", "AUTHORISED", "2026-07-31", "golf025", [
    L("D.Social", "214", 6280, 628, GOLF025),
    L("Service", "21403", 995.61, 99.56, GOLF025),
  ]),
  I("9324392b", "INV-1394", "PAID", "2026-07-31", "PGAAUS015", [
    L("D.Social", "214", 3439.2, 343.92, PGA),
    L("Service", "21403", 859.8, 85.98, PGA),
  ]),
  I("e83f51a0", "INV-1438", "AUTHORISED", "2026-08-31", "golf025", [
    L("D.Social", "214", 6799, 679.9, GOLF025),
    L("Service", "21403", 1230.6, 123.06, GOLF025),
  ]),
  I("b25d4be0", "INV-1450", "PAID", "2026-08-31", "PGAAUS015", [
    L("D.Social", "214", 10010, 1001, PGA),
    L("T.Adserving", "21404", 18.26, 1.83, PGA),
    L("Service", "21403", 963.22, 96.32, PGA),
  ]),
  I("877d74d7", "INV-1468", "AUTHORISED", "2026-09-30", "BICAU006", [
    L("D.ProgrammaticVideo", "214", 21544.81, 2154.48, BIC),
    L("D.ProgrammaticVideo", "214", 6923.08, 692.31, BIC),
    L("D.ProgrammaticVideo", "214", 16153.84, 1615.38, BIC),
    L("D.ProgrammaticVideo", "214", 5274.73, 527.47, BIC),
    L("D.Social", "214", 14241.76, 1424.18, BIC),
    L("D.Social", "214", 5934.06, 593.41, BIC),
    L("D.Social", "214", 3560.44, 356.04, BIC),
    L("T.Adserving", "21404", 531.98, 53.2, BIC),
    L("Service", "21403", 7212.63, 721.26, BIC),
  ]),
  I("c97486a9", "INV-1477", "AUTHORISED", "2026-09-30", "golf025", [
    L("D.Video", "214", 9246.1, 924.61, GOLF025),
    L("D.Newspaper", "214", 8177.9, 817.79, GOLF025),
    L("D.Social", "214", 8955, 895.5, GOLF025),
    L("D.ProgrammaticVideo", "214", 666.66, 66.67, GOLF025),
    L("T.Adserving", "21404", 55.43, 5.54, GOLF025),
    L("Service", "21403", 1810.02, 181, GOLF025),
  ]),
  I("df235e69", "INV-1505", "AUTHORISED", "2026-09-30", "PGAAUS015", [
    L("D.Social", "214", 10573, 1057.3, PGA),
    L("Service", "21403", 1352.67, 135.27, PGA),
  ]),
  I("b6cf9b9f", "INV-1519", "DRAFT", "2026-10-31", "BICAU006", [
    L("D.ProgrammaticVideo", "214", 54533.07, 5453.31, BIC),
    L("G. Display", "212", 30000, 3000, BIC, "G.Display"),
    L("D.Social", "214", 36197.8, 3619.78, BIC),
    L("D.Social", "214", 12065.94, 1206.59, BIC),
    L("D.ProgrammaticVideo", "214", 46923.08, 4692.31, BIC),
    L("T.Adserving", "21404", 1298.45, 129.85, BIC),
    L("Service", "21403", 17604.32, 1760.43, BIC),
  ]),
  I("009a1cd4", "INV-1524", "DRAFT", "2026-10-31", "golf025", [
    L("G. Video", "212", 12347.08, 1234.71, GOLF025),
    L("D.Social", "214", 11466, 1146.6, GOLF025),
    L("G. Display", "212", 17349.91, 1734.99, GOLF025, "D.Display"),
    L("D.ProgrammaticVideo", "214", 2583.34, 258.33, GOLF025),
    L("T.Adserving", "21404", 82.92, 8.29, GOLF025),
    L("Service", "21403", 2707.79, 270.78, GOLF025),
  ]),
  I("19c87adf", "INV-1547", "DRAFT", "2026-10-31", "PGAAUS015", [
    L("D.Social", "214", 6477.21, 647.72, PGA),
    L("D.Social", "214", 13112, 1311.2, PGA),
    L("D.Newspaper", "214", 7134.5, 713.45, PGA),
    L("G. Display", "212", 13644.6, 1364.46, PGA, "G.Display"),
    L("G.Radio", "212", 1038.86, 103.89, PGA),
    L("G.Radio", "212", 1897.71, 189.77, PGA),
    L("D.ProgrammaticVideo", "214", 5837, 583.7, PGA),
    L("T.Adserving", "21404", 427.36, 42.74, PGA),
    L("G. Production", "212", 1631.58, 163.16, PGA, "G.Prod"),
    L("Service", "21403", 5801.77, 580.18, PGA),
  ]),
]

export const MATCHED_RECORDS: TrueUpMatchedRecordSqlRow[] = [
  { xero_invoice_id: "877d74d7", invoice_key: "media:BICAU006:2026-09", mba_number: "BICAU006", billing_month: "2026-09" },
  { xero_invoice_id: "c97486a9", invoice_key: "media:golf025:2026-09", mba_number: "golf025", billing_month: "2026-09" },
  { xero_invoice_id: "df235e69", invoice_key: "media:PGAAUS015:2026-09", mba_number: "PGAAUS015", billing_month: "2026-09" },
  { xero_invoice_id: "b6cf9b9f", invoice_key: "media:BICAU006:2026-10", mba_number: "BICAU006", billing_month: "2026-10" },
  { xero_invoice_id: "009a1cd4", invoice_key: "media:golf025:2026-10", mba_number: "golf025", billing_month: "2026-10" },
  { xero_invoice_id: "19c87adf", invoice_key: "media:PGAAUS015:2026-10", mba_number: "PGAAUS015", billing_month: "2026-10" },
]
