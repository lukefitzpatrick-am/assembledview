import {
  accrualPayableAmount,
  accrualReceivableAmount,
  accrualServiceFeeAmount,
  type AccrualRow,
} from "@/lib/finance/computeAccrual"

export type AccrualDetailSide =
  | "Receivable"
  | "Payable (agency, deducted)"
  | "Fee (SOW/retainer, deducted)"

/** Blank MBA shows as "—", trimmed, the same key as the on-screen MBA breakdown. */
function mbaLabel(mba: string | null | undefined): string {
  return (mba || "").trim() || "—"
}

export type AccrualDetailRow = {
  client: string
  month: string
  side: AccrualDetailSide
  type: string
  mba: string
  campaign: string
  status: string
  amount: number
}

/**
 * Contributor lines for the detail sheet. Amounts come from the same per-record
 * helpers as the summary (`computeAccrual.ts`), so each side sums to the
 * summary's receivable, payable and fee totals (client-pays media excluded,
 * fees only on the accrual status set).
 */
export function buildAccrualDetailRows(rows: AccrualRow[]): AccrualDetailRow[] {
  const out: AccrualDetailRow[] = []
  for (const r of rows) {
    for (const rec of r.contributing_receivables) {
      out.push({
        client: r.client_name,
        month: r.month,
        side: "Receivable",
        type: rec.billing_type,
        mba: mbaLabel(rec.mba_number),
        campaign: rec.campaign_name || "",
        status: rec.status,
        amount: accrualReceivableAmount(rec),
      })
    }
    for (const pay of r.contributing_payables) {
      out.push({
        client: r.client_name,
        month: r.month,
        side: "Payable (agency, deducted)",
        type: pay.billing_type,
        mba: mbaLabel(pay.mba_number),
        campaign: pay.campaign_name || "",
        status: pay.status,
        amount: accrualPayableAmount(pay),
      })
    }
    for (const rec of r.contributing_receivables) {
      const fees = accrualServiceFeeAmount(rec)
      if (fees <= 0) continue
      out.push({
        client: r.client_name,
        month: r.month,
        side: "Fee (SOW/retainer, deducted)",
        type: rec.billing_type,
        mba: mbaLabel(rec.mba_number),
        campaign: rec.campaign_name || "",
        status: rec.status,
        amount: fees,
      })
    }
  }
  return out
}
