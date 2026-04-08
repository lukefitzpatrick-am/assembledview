import type { BillingRecord, BillingType } from "@/lib/types/financeBilling"
import { sumPayableLineItems } from "@/lib/finance/aggregatePayablesPublisherGroups"
import type { MonthRange } from "./monthRange"
import { expandMonthRange } from "./monthRange"

export type { MonthRange } from "./monthRange"
export { expandMonthRange } from "./monthRange"

export type AccrualRow = {
  clients_id: number
  client_name: string
  month: string
  receivable_total: number
  payable_total: number
  fees_total: number
  accrual: number
  reconciled: boolean
  reconciled_at: string | null
  contributing_receivables: BillingRecord[]
  contributing_payables: BillingRecord[]
}

const RECEIVABLE_TYPES: BillingType[] = ["media", "sow", "retainer"]
/** Receivable amounts in accrual: match Overview KPIs (`booked` + downstream billing states). */
const RECEIVABLE_STATUSES = new Set(["booked", "approved", "invoiced", "paid"])

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function sumLineItemsExpected(record: BillingRecord): number {
  if (record.billing_type === "payable") {
    return sumPayableLineItems(record)
  }
  const items = record.line_items || []
  return roundMoney(items.reduce((s, li) => s + Number(li.amount || 0), 0))
}

function sumServiceFees(record: BillingRecord): number {
  const items = record.line_items || []
  return roundMoney(
    items
      .filter((li) => li.line_type === "service" || li.line_type === "fee")
      .reduce((s, li) => s + Number(li.amount || 0), 0)
  )
}

function isReceivable(r: BillingRecord): boolean {
  return RECEIVABLE_TYPES.includes(r.billing_type)
}

function isPayable(r: BillingRecord): boolean {
  return r.billing_type === "payable"
}

function isFeeSource(r: BillingRecord): boolean {
  return r.billing_type === "sow" || r.billing_type === "retainer"
}

export function accrualBucketKey(clients_id: number, month: string): string {
  return `${clients_id}|${month}`
}

/**
 * Merge published `finance_edits` rows (`record_type === "accrual_reconcile"`) into a lookup by `clients_id|month`.
 * Latest edit by numeric `id` wins.
 */
export function parseAccrualReconcilesFromEdits(
  edits: unknown[]
): Map<string, { reconciled: boolean; reconciled_at: string | null }> {
  const best = new Map<string, { reconciled: boolean; reconciled_at: string | null; id: number }>()
  for (const raw of edits) {
    if (!raw || typeof raw !== "object") continue
    const row = raw as Record<string, unknown>
    const rt = row.record_type ?? row.recordType
    if (rt !== "accrual_reconcile") continue
    const fn = String(row.field_name ?? row.fieldName ?? "")
    const m = /^accrual:(\d+):(\d{4}-\d{2})$/.exec(fn)
    if (!m) continue
    const key = `${m[1]}|${m[2]}`
    const nv = String(row.new_value ?? row.newValue ?? "").toLowerCase()
    const reconciled = nv === "1" || nv === "true" || nv === "yes"
    const id = Number(row.id) || 0
    const at =
      row.published_at ?? row.publishedAt ?? row.created_at ?? row.createdAt ?? row.updated_at ?? row.updatedAt
    const prev = best.get(key)
    if (!prev || id >= prev.id) {
      best.set(key, {
        reconciled,
        reconciled_at: at != null ? String(at) : null,
        id,
      })
    }
  }
  return new Map(
    [...best.entries()].map(([k, v]) => [k, { reconciled: v.reconciled, reconciled_at: v.reconciled_at }])
  )
}

type Bucket = {
  clients_id: number
  client_name: string
  month: string
  receivable_total: number
  payable_total: number
  fees_total: number
  contributing_receivables: BillingRecord[]
  contributing_payables: BillingRecord[]
}

/**
 * One row per client × month in range when any receivable, payable, or fee activity exists for that bucket.
 * Reconciliation flags come from `reconcile` (built from finance_edits).
 */
export function computeAccrualByClient(
  receivables: BillingRecord[],
  payables: BillingRecord[],
  monthRange: MonthRange,
  reconcile?: ReadonlyMap<string, { reconciled: boolean; reconciled_at: string | null }>
): AccrualRow[] {
  const months = new Set(expandMonthRange(monthRange))
  if (months.size === 0) return []

  const buckets = new Map<string, Bucket>()

  const touch = (clients_id: number, client_name: string, month: string) => {
    if (!months.has(month)) return
    const key = accrualBucketKey(clients_id, month)
    if (!buckets.has(key)) {
      buckets.set(key, {
        clients_id,
        client_name: client_name.trim() || "Unknown client",
        month,
        receivable_total: 0,
        payable_total: 0,
        fees_total: 0,
        contributing_receivables: [],
        contributing_payables: [],
      })
    } else {
      const b = buckets.get(key)!
      if (b.client_name === "Unknown client" && client_name.trim()) {
        b.client_name = client_name.trim()
      }
    }
  }

  for (const r of receivables) {
    if (!isReceivable(r)) continue
    const m = r.billing_month
    if (!months.has(m)) continue
    if (!RECEIVABLE_STATUSES.has(r.status)) continue
    touch(r.clients_id, r.client_name, m)
    const b = buckets.get(accrualBucketKey(r.clients_id, m))!
    const add = roundMoney(Number(r.total || 0))
    b.receivable_total = roundMoney(b.receivable_total + add)
    b.contributing_receivables.push(r)
  }

  for (const r of payables) {
    if (!isPayable(r)) continue
    const m = r.billing_month
    if (!months.has(m)) continue
    touch(r.clients_id, r.client_name, m)
    const b = buckets.get(accrualBucketKey(r.clients_id, m))!
    const add = sumLineItemsExpected(r)
    b.payable_total = roundMoney(b.payable_total + add)
    b.contributing_payables.push(r)
  }

  for (const r of receivables) {
    if (!isFeeSource(r)) continue
    const m = r.billing_month
    if (!months.has(m)) continue
    const fees = sumServiceFees(r)
    if (fees <= 0) continue
    touch(r.clients_id, r.client_name, m)
    const b = buckets.get(accrualBucketKey(r.clients_id, m))!
    b.fees_total = roundMoney(b.fees_total + fees)
  }

  if (reconcile) {
    for (const [key] of reconcile) {
      const parts = key.split("|")
      if (parts.length < 2) continue
      const cid = Number(parts[0])
      const month = parts[1]!
      if (!Number.isFinite(cid) || !months.has(month)) continue
      if (!buckets.has(key)) {
        buckets.set(key, {
          clients_id: cid,
          client_name: "Unknown client",
          month,
          receivable_total: 0,
          payable_total: 0,
          fees_total: 0,
          contributing_receivables: [],
          contributing_payables: [],
        })
      }
    }
  }

  const rows: AccrualRow[] = [...buckets.values()].map((b) => {
    const k = accrualBucketKey(b.clients_id, b.month)
    const rec = reconcile?.get(k)
    const accrual = roundMoney(b.receivable_total - b.payable_total - b.fees_total)
    return {
      clients_id: b.clients_id,
      client_name: b.client_name,
      month: b.month,
      receivable_total: b.receivable_total,
      payable_total: b.payable_total,
      fees_total: b.fees_total,
      accrual,
      reconciled: rec?.reconciled ?? false,
      reconciled_at: rec?.reconciled_at ?? null,
      contributing_receivables: b.contributing_receivables,
      contributing_payables: b.contributing_payables,
    }
  })

  rows.sort((a, b) => {
    const ca = a.client_name.localeCompare(b.client_name, undefined, { sensitivity: "base" })
    if (ca !== 0) return ca
    return a.month.localeCompare(b.month)
  })

  return rows
}
