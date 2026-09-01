import type { BillingRecord } from "@/lib/types/financeBilling"

function hasApprovedStamp(record: BillingRecord): boolean {
  const stamp = record.approved_at
  if (stamp == null) return false
  if (typeof stamp === "string") return stamp.trim().length > 0
  if (typeof stamp === "number") return Number.isFinite(stamp) && stamp !== 0
  return false
}

/** Excel invoicing workbook includes only approved rows. */
export function filterApprovedReceivablesForExport(records: BillingRecord[]): BillingRecord[] {
  return records.filter(hasApprovedStamp)
}

/** Keys the "Mark as sent to finance" action stamps — approved only, never unapproved. */
export function invoiceKeysReadyToMarkSent(records: BillingRecord[]): string[] {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const r of filterApprovedReceivablesForExport(records)) {
    const k = r.invoice_key?.trim()
    if (!k || seen.has(k)) continue
    seen.add(k)
    keys.push(k)
  }
  return keys
}

function exportedAtMs(value: unknown): number | null {
  if (value == null || value === "") return null
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value === 0) return null
    return value < 1e12 ? value * 1000 : value
  }
  const t = Date.parse(String(value))
  return Number.isNaN(t) ? null : t
}

export type LastExportSummary = {
  exportedAt: string
  exportedBy: number | null
  exportedByName: string | null
  clientCount: number
  total: number
}

/**
 * Latest export in the current invoicing scope: max(exported_at), then the
 * clients and dollars that share that stamp.
 */
export function summariseLastExport(records: BillingRecord[]): LastExportSummary | null {
  let maxMs = -1
  let maxStamp: string | number | null = null
  for (const r of records) {
    const ms = exportedAtMs(r.exported_at)
    if (ms == null || ms < maxMs) continue
    maxMs = ms
    maxStamp = r.exported_at ?? null
  }
  if (maxMs < 0 || maxStamp == null) return null

  const batch = records.filter((r) => exportedAtMs(r.exported_at) === maxMs)
  const clients = new Set<number>()
  let total = 0
  let exportedBy: number | null = null
  let exportedByName: string | null = null
  for (const r of batch) {
    if (Number.isFinite(r.clients_id)) clients.add(r.clients_id)
    total += Number.isFinite(r.total) ? r.total : 0
    if (exportedBy == null && r.exported_by != null) exportedBy = r.exported_by
    const name = r.exported_by_name?.trim()
    if (!exportedByName && name) exportedByName = name
  }
  const exportedAt =
    typeof maxStamp === "number" ? new Date(maxMs).toISOString() : String(maxStamp)

  return {
    exportedAt,
    exportedBy,
    exportedByName,
    clientCount: clients.size,
    total: Math.round(total * 100) / 100,
  }
}
