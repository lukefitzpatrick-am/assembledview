/**
 * Postgres persistence for finance_periods / finance_run_items / app_notifications.
 * Uses drizzle sql tagged templates (tables added in migration 0010; drizzle schema sync later).
 */

import { sql } from "drizzle-orm"
import { getDb } from "@/db"
import { toPeriodMonthDate, toPeriodMonthKey } from "@/lib/finance/periods/monthKey"
import type {
  AppNotification,
  FinancePeriod,
  FinancePeriodStatus,
  FinanceRunItem,
  FinanceRunItemStatus,
  FinanceRunSource,
  RunCandidate,
} from "@/lib/finance/periods/types"
import { mergeRunCandidates } from "@/lib/finance/periods/mergeRun"

function mapPeriod(r: Record<string, unknown>): FinancePeriod {
  return {
    id: Number(r.id),
    periodMonth: toPeriodMonthKey(String(r.period_month)),
    status: String(r.status) as FinancePeriodStatus,
    ranAt: r.ran_at == null ? null : String(r.ran_at),
    lockedAt: r.locked_at == null ? null : String(r.locked_at),
    lockedBy: r.locked_by == null ? null : String(r.locked_by),
    amendedAfterLock: Boolean(r.amended_after_lock),
    sheetBlobPathname: r.sheet_blob_pathname == null ? null : String(r.sheet_blob_pathname),
    sheetVersion: Number(r.sheet_version) || 1,
  }
}

function mapItem(r: Record<string, unknown>): FinanceRunItem {
  return {
    id: Number(r.id),
    periodId: Number(r.period_id),
    source: String(r.source) as FinanceRunSource,
    naturalKey: String(r.natural_key),
    mbaNumber: r.mba_number == null ? null : String(r.mba_number),
    clientId: r.client_id == null ? null : Number(r.client_id),
    versionId: r.version_id == null ? null : Number(r.version_id),
    sowId: r.sow_id == null ? null : Number(r.sow_id),
    lineItemsJson: r.line_items_json ?? [],
    amountCents: Number(r.amount_cents) || 0,
    invoiceReference: String(r.invoice_reference ?? ""),
    status: String(r.status) as FinanceRunItemStatus,
    adjustmentCents: r.adjustment_cents == null ? null : Number(r.adjustment_cents),
    adjustmentReason: r.adjustment_reason == null ? null : String(r.adjustment_reason),
    holdReason: r.hold_reason == null ? null : String(r.hold_reason),
    excludeReason: r.exclude_reason == null ? null : String(r.exclude_reason),
    clientSnapshotJson: (r.client_snapshot_json as FinanceRunItem["clientSnapshotJson"]) ?? null,
    linkedVarianceFromItemId:
      r.linked_variance_from_item_id == null ? null : Number(r.linked_variance_from_item_id),
    rolledFromItemId: r.rolled_from_item_id == null ? null : Number(r.rolled_from_item_id),
  }
}

function rowsOf(result: unknown): Record<string, unknown>[] {
  const r = result as { rows?: Record<string, unknown>[] }
  if (Array.isArray(r?.rows)) return r.rows
  if (Array.isArray(result)) return result as Record<string, unknown>[]
  return []
}

export async function ensurePeriodPg(periodMonth: string): Promise<FinancePeriod> {
  const db = getDb()
  const d = toPeriodMonthDate(periodMonth)
  await db.execute(sql`
    INSERT INTO finance_periods (period_month, status)
    VALUES (${d}::date, 'open')
    ON CONFLICT (period_month) DO NOTHING
  `)
  const res = await db.execute(sql`
    SELECT * FROM finance_periods WHERE period_month = ${d}::date LIMIT 1
  `)
  const row = rowsOf(res)[0]
  if (!row) throw new Error(`Failed to ensure period ${periodMonth}`)
  return mapPeriod(row)
}

export async function listPeriodsPg(): Promise<FinancePeriod[]> {
  const db = getDb()
  const res = await db.execute(sql`
    SELECT * FROM finance_periods ORDER BY period_month DESC
  `)
  return rowsOf(res).map(mapPeriod)
}

export async function getPeriodPg(periodMonth: string): Promise<FinancePeriod | null> {
  const db = getDb()
  const d = toPeriodMonthDate(periodMonth)
  const res = await db.execute(sql`
    SELECT * FROM finance_periods WHERE period_month = ${d}::date LIMIT 1
  `)
  const row = rowsOf(res)[0]
  return row ? mapPeriod(row) : null
}

export async function listRunItemsPg(periodId: number): Promise<FinanceRunItem[]> {
  const db = getDb()
  const res = await db.execute(sql`
    SELECT * FROM finance_run_items WHERE period_id = ${periodId} ORDER BY natural_key
  `)
  return rowsOf(res).map(mapItem)
}

export async function upsertRunItemsPg(
  periodId: number,
  candidates: RunCandidate[]
): Promise<{ items: FinanceRunItem[]; inserted: number; updated: number }> {
  const existing = await listRunItemsPg(periodId)
  const merged = mergeRunCandidates({ periodId, existing, candidates })
  const db = getDb()

  for (const item of merged.items) {
    const isNew = !existing.some((e) => e.source === item.source && e.naturalKey === item.naturalKey)
    if (isNew) {
      await db.execute(sql`
        INSERT INTO finance_run_items (
          period_id, source, natural_key, mba_number, client_id, version_id, sow_id,
          line_items_json, amount_cents, invoice_reference, status, hold_reason,
          rolled_from_item_id, linked_variance_from_item_id
        ) VALUES (
          ${periodId},
          ${item.source}::finance_run_source,
          ${item.naturalKey},
          ${item.mbaNumber},
          ${item.clientId},
          ${item.versionId},
          ${item.sowId},
          ${JSON.stringify(item.lineItemsJson)}::jsonb,
          ${item.amountCents},
          ${item.invoiceReference},
          ${item.status}::finance_run_item_status,
          ${item.holdReason},
          ${item.rolledFromItemId},
          ${item.linkedVarianceFromItemId}
        )
        ON CONFLICT (period_id, source, natural_key) DO NOTHING
      `)
    } else if (["pending", "stale"].includes(item.status)) {
      await db.execute(sql`
        UPDATE finance_run_items SET
          amount_cents = ${item.amountCents},
          line_items_json = ${JSON.stringify(item.lineItemsJson)}::jsonb,
          invoice_reference = ${item.invoiceReference},
          version_id = ${item.versionId},
          status = ${item.status}::finance_run_item_status,
          hold_reason = ${item.holdReason},
          updated_at = now()
        WHERE period_id = ${periodId}
          AND source = ${item.source}::finance_run_source
          AND natural_key = ${item.naturalKey}
          AND status IN ('pending', 'stale')
      `)
    }
  }

  const items = await listRunItemsPg(periodId)
  return { items, inserted: merged.inserted, updated: merged.updated }
}

export async function updatePeriodStatusPg(
  periodId: number,
  patch: Partial<{
    status: FinancePeriodStatus
    ranAt: string | null
    lockedAt: string | null
    lockedBy: string | null
    amendedAfterLock: boolean
    sheetBlobPathname: string | null
    sheetVersion: number
  }>
): Promise<void> {
  const db = getDb()
  if (patch.status != null) {
    await db.execute(sql`
      UPDATE finance_periods SET status = ${patch.status}::finance_period_status WHERE id = ${periodId}
    `)
  }
  if (patch.ranAt !== undefined) {
    await db.execute(sql`UPDATE finance_periods SET ran_at = ${patch.ranAt}::timestamptz WHERE id = ${periodId}`)
  }
  if (patch.lockedAt !== undefined) {
    await db.execute(sql`UPDATE finance_periods SET locked_at = ${patch.lockedAt}::timestamptz WHERE id = ${periodId}`)
  }
  if (patch.lockedBy !== undefined) {
    await db.execute(sql`UPDATE finance_periods SET locked_by = ${patch.lockedBy} WHERE id = ${periodId}`)
  }
  if (patch.amendedAfterLock !== undefined) {
    await db.execute(sql`UPDATE finance_periods SET amended_after_lock = ${patch.amendedAfterLock} WHERE id = ${periodId}`)
  }
  if (patch.sheetBlobPathname !== undefined) {
    await db.execute(sql`UPDATE finance_periods SET sheet_blob_pathname = ${patch.sheetBlobPathname} WHERE id = ${periodId}`)
  }
  if (patch.sheetVersion !== undefined) {
    await db.execute(sql`UPDATE finance_periods SET sheet_version = ${patch.sheetVersion} WHERE id = ${periodId}`)
  }
}

export async function updateRunItemPg(item: FinanceRunItem): Promise<void> {
  const db = getDb()
  await db.execute(sql`
    UPDATE finance_run_items SET
      status = ${item.status}::finance_run_item_status,
      amount_cents = ${item.amountCents},
      adjustment_cents = ${item.adjustmentCents},
      adjustment_reason = ${item.adjustmentReason},
      hold_reason = ${item.holdReason},
      exclude_reason = ${item.excludeReason},
      client_snapshot_json = ${item.clientSnapshotJson ? JSON.stringify(item.clientSnapshotJson) : null}::jsonb,
      line_items_json = ${JSON.stringify(item.lineItemsJson)}::jsonb,
      linked_variance_from_item_id = ${item.linkedVarianceFromItemId},
      rolled_from_item_id = ${item.rolledFromItemId},
      updated_at = now()
    WHERE id = ${item.id}
  `)
}

export async function insertNotificationPg(args: {
  audience: string
  kind: string
  payload: Record<string, unknown>
}): Promise<AppNotification> {
  const db = getDb()
  const res = await db.execute(sql`
    INSERT INTO app_notifications (audience, kind, payload)
    VALUES (${args.audience}, ${args.kind}, ${JSON.stringify(args.payload)}::jsonb)
    RETURNING *
  `)
  const row = rowsOf(res)[0]!
  return {
    id: Number(row.id),
    audience: String(row.audience),
    kind: String(row.kind),
    payload: (row.payload as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at),
    readAt: row.read_at == null ? null : String(row.read_at),
  }
}

export async function listNotificationsPg(audience: string, limit = 50): Promise<AppNotification[]> {
  const db = getDb()
  const res = await db.execute(sql`
    SELECT * FROM app_notifications
    WHERE audience = ${audience}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `)
  return rowsOf(res).map((row) => ({
    id: Number(row.id),
    audience: String(row.audience),
    kind: String(row.kind),
    payload: (row.payload as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at),
    readAt: row.read_at == null ? null : String(row.read_at),
  }))
}
