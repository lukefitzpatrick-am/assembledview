import "server-only"

import { getDb, schema } from "@/db"
import {
  enrichFinanceExcelClientMetaFromApiRow,
  type FinanceExcelClientMeta,
} from "@/lib/finance/excelFinanceExport"
import { loadComposedBillingRecordsForMonth } from "@/lib/finance/loadComposedBillingMonth"
import {
  packRowsFromBillingRecords,
  type AccountsPackRow,
} from "@/lib/finance/sendToAccounts"
import type { BillingRecord } from "@/lib/types/financeBilling"

export type LoadedAccountsPack = {
  rows: AccountsPackRow[]
  records: BillingRecord[]
  metaByClientId: Map<number, FinanceExcelClientMeta>
}

export async function loadAccountsPack(
  month: string
): Promise<LoadedAccountsPack | { ok: false; status: number; error: string }> {
  const db = getDb()
  const [loaded, clientRows, linkRows] = await Promise.all([
    loadComposedBillingRecordsForMonth({ monthStr: month }),
    db.select().from(schema.clients),
    db
      .select({ clientId: schema.xeroContactLinks.clientId })
      .from(schema.xeroContactLinks),
  ])
  if (!loaded.ok) {
    return { ok: false, status: loaded.status, error: loaded.error }
  }

  const metaByClientId = new Map<number, FinanceExcelClientMeta>()
  const legalNameByClientId = new Map<number, string>()
  for (const row of clientRows) {
    const enriched = enrichFinanceExcelClientMetaFromApiRow(row as Record<string, unknown>)
    if (enriched.clientId == null) continue
    metaByClientId.set(enriched.clientId, enriched.meta)
    const raw = row as { legalbusinessname?: string | null }
    legalNameByClientId.set(enriched.clientId, (raw.legalbusinessname ?? "").trim())
  }

  const linkedClientIds = new Set<number>()
  for (const link of linkRows) {
    if (link.clientId != null) linkedClientIds.add(Number(link.clientId))
  }

  const rows = packRowsFromBillingRecords(loaded.records, month, {
    linkedClientIds,
    legalNameByClientId,
  })
  const keys = new Set(rows.map((row) => row.invoiceKey))
  return {
    rows,
    records: loaded.records.filter((record) => keys.has(record.invoice_key?.trim() ?? "")),
    metaByClientId,
  }
}
