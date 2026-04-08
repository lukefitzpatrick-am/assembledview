/** `payable` = publisher/delivery view from `media_plan_versions.deliverySchedule`, not `billingSchedule`. */
export type BillingType = "media" | "sow" | "retainer" | "payable"

export type BillingStatus =
  | "draft"
  | "booked"
  | "approved"
  | "invoiced"
  | "paid"
  | "cancelled"
  | "expected"
  | "disputed"

export interface BillingLineItem {
  id: number
  finance_billing_records_id: number
  item_code: string
  line_type: "media" | "service" | "fee" | "retainer"
  media_type: string | null
  description: string | null
  publisher_name: string | null
  amount: number
  client_pays_media: boolean
  sort_order: number
  /** Joined from media plan row / reference tables when available (Xano or in-app enrichment). */
  network?: string | null
  platform?: string | null
  placement?: string | null
  market?: string | null
  title?: string | null
  ad_size?: string | null
  site?: string | null
  station?: string | null
  format?: string | null
  bid_strategy?: string | null
  creative?: string | null
}

/** Accrual grid synthetic rows (month detail, per-client subtotal, grand total). */
export type FinanceAccrualRowKind = "month" | "client_subtotal" | "grand_total"

export interface FinanceAccrualBreakdown {
  kind: FinanceAccrualRowKind
  receivable_total: number
  payable_total: number
  fees_total: number
  accrual: number
  month?: string
  clients_id?: number
}

export interface BillingRecord {
  id: number
  billing_type: BillingType
  clients_id: number
  client_name: string
  mba_number: string | null
  campaign_name: string | null
  po_number: string | null
  billing_month: string
  invoice_date: string | null
  payment_days: number
  payment_terms: string
  status: BillingStatus
  line_items: BillingLineItem[]
  total: number
  has_pending_edits: boolean
  source_billing_schedule_id: number | null
  finance_accrual?: FinanceAccrualBreakdown | null
}

export interface BillingEdit {
  id: number
  finance_billing_records_id: number
  finance_billing_line_items_id: number | null
  edit_type: "field_change" | "amount_change" | "status_change" | "line_add" | "line_remove"
  field_name: string
  old_value: string | null
  new_value: string | null
  edit_status: "draft" | "published" | "reverted"
  edited_by: number
  edited_by_name: string
  published_at: string | null
  created_at: string
}

export interface FinanceFilters {
  selectedClients: string[]
  /** Publisher row ids from `/api/publishers` (Xano). Empty = all. */
  selectedPublishers: number[]
  /** When false, downstream APIs may omit draft rows where supported. */
  includeDrafts: boolean
  monthRange: { from: string; to: string }
  billingTypes: BillingType[]
  statuses: BillingStatus[]
  searchQuery: string
}

export interface SavedView {
  id: number
  name: string
  filters: FinanceFilters
}
