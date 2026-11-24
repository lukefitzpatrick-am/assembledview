import "server-only"

import { getDb, schema } from "@/db"
import {
  enrichFinanceExcelClientMetaFromApiRow,
  type FinanceExcelClientMeta,
} from "@/lib/finance/excelFinanceExport"
import type { AbovePlanHold } from "@/lib/finance/abovePlan"
import { splitAbovePlanHolds } from "@/lib/finance/abovePlanHold.server"
import { loadComposedBillingRecordsForMonth } from "@/lib/finance/loadComposedBillingMonth"
import { isFeatureOn } from "@/lib/features/server"
import {
  packRowsFromBillingRecords,
  type AccountsPackRow,
} from "@/lib/finance/sendToAccounts"
import type { BillingRecord } from "@/lib/types/financeBilling"

export type LoadedAccountsPack = {
  rows: AccountsPackRow[]
  /** S14: media rows above plan with no reason covering them. Never in `rows`. */
  held: AbovePlanHold[]
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

  const packRows = packRowsFromBillingRecords(loaded.records, month, {
    linkedClientIds,
    legalNameByClientId,
  })
  // S14: the one choke point to Xero. Preview and send both read the pack from here.
  const { rows, held } = (await isFeatureOn("billing_above_plan_hold"))
    ? await splitAbovePlanHolds(db, { rows: packRows, records: loaded.records, versions: loaded.versions })
    : { rows: packRows, held: [] }
  const keys = new Set(rows.map((row) => row.invoiceKey))
  return {
    rows,
    held,
    records: loaded.records.filter((record) => keys.has(record.invoice_key?.trim() ?? "")),
    metaByClientId,
  }
}
