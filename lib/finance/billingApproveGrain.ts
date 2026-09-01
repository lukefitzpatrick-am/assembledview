import type { BillingRecord } from "@/lib/types/financeBilling"

const GRAIN_TYPES = ["media", "sow", "retainer"] as const
export type BillingApproveGrainType = (typeof GRAIN_TYPES)[number]

export type BillingApproveGrain = {
  invoice_key: string
  billing_type: BillingApproveGrainType
  clients_id: number
  client_name: string
  mba_number: string | null
  campaign_name: string | null
  billing_month: string
  total: number
  line_items: Array<{
    item_code: string
    amount: number
    schedule_line_item_id?: string | null
  }>
}

export function isBillingApproveGrainType(v: unknown): v is BillingApproveGrainType {
  return typeof v === "string" && (GRAIN_TYPES as readonly string[]).includes(v)
}

export function grainFromBillingRecord(record: BillingRecord): BillingApproveGrain | null {
  const invoice_key = record.invoice_key?.trim()
  if (!invoice_key) return null
  if (!isBillingApproveGrainType(record.billing_type)) return null
  if (!record.billing_month?.trim()) return null
  if (!Number.isFinite(record.clients_id)) return null
  if (typeof record.client_name !== "string" || record.client_name.trim().length === 0) {
    return null
  }
  return {
    invoice_key,
    billing_type: record.billing_type,
    clients_id: record.clients_id,
    client_name: record.client_name,
    mba_number: record.mba_number ?? null,
    campaign_name: record.campaign_name ?? null,
    billing_month: record.billing_month,
    total: Number.isFinite(record.total) ? record.total : 0,
    line_items: (record.line_items ?? []).map((li) => ({
      item_code: li.item_code ?? "",
      amount: Number.isFinite(li.amount) ? li.amount : 0,
      schedule_line_item_id: li.schedule_line_item_id ?? null,
    })),
  }
}
