/**
 * FB-2b: the one invoice lines CSV. The Clients billing "Download CSV" and
 * the Send to accounts pack CSV (blob store, sent-row download link, email
 * attachment) both come from here, so the same records give the same bytes.
 *
 * Rows per invoice block (client, MBA, month, billing type), in workbook
 * order. `row_type`:
 * - `line`: grouped media line (or scope line)
 * - `subtotal`: per supplier within one item code and media type, display only
 * - `service`: fee, ad serving, production, retainer
 * - `total`: invoice block total
 * An import sums `line` and `service` rows only.
 */

import { billingRecordsToFinanceCampaigns } from "@/lib/finance/billingRecordToCampaignData"
import { groupInvoiceMediaRows } from "@/lib/finance/groupInvoiceMediaRows"
import { toCents } from "@/lib/money"
import type { BillingRecord } from "@/lib/types/financeBilling"

export const INVOICE_LINES_CSV_HEADER = [
  "row_type",
  "client_name",
  "mba_number",
  "campaign_name",
  "billing_type",
  "status",
  "billing_month",
  "item_code",
  "media_type",
  "description",
  "amount",
].join(",")

function csvText(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function csvMoney(cents: number): string {
  return (cents / 100).toFixed(2)
}

export function buildInvoiceLinesCsv(records: BillingRecord[]): string {
  const campaigns = billingRecordsToFinanceCampaigns(records, undefined, {
    statusLabel: (r) => r.status || "",
  })
  const out: string[] = [INVOICE_LINES_CSV_HEADER]
  for (const c of campaigns) {
    const head = [
      csvText((c.clientName || "").trim()),
      csvText((c.mbaNumber || "").trim()),
      csvText((c.campaignName || "").trim()),
      c.billingType ?? "",
      c.status ?? "",
      c.billingMonth ?? "",
    ]
    const row = (type: string, itemCode: string, mediaType: string, description: string, cents: number) =>
      out.push(
        [type, ...head, csvText(itemCode), csvText(mediaType), csvText(description), csvMoney(cents)].join(",")
      )
    const lineRows =
      c.billingType === "media"
        ? groupInvoiceMediaRows(c.lineItems)
        : c.lineItems.map((li) => ({
            rowType: "line" as const,
            itemCode: li.itemCode,
            mediaType: li.mediaType,
            description: li.description,
            amountCents: toCents(li.amount),
          }))
    for (const r of lineRows) row(r.rowType, r.itemCode, r.mediaType, r.description, r.amountCents)
    for (const s of c.serviceRows) row("service", s.itemCode, s.service, "", toCents(s.amount))
    row("total", "", "", "Total", toCents(c.total))
  }
  return out.join("\n")
}
