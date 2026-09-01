/**
 * finance_billing_records / finance_billing_line_items mutate path (T0-1).
 * Postgres only. Natural key is invoice_key. Never writes xero: rows —
 * those belong to lib/xero/stages/importBillingRecords.ts.
 */

import "server-only"

import { sql } from "drizzle-orm"

import { getDb } from "@/db"
import {
  mapFinanceBillingLineItemFromPostgres,
  mapFinanceBillingRecordFromPostgres,
} from "@/lib/data/readFinance"

export class FinanceBillingWriteError extends Error {
  constructor(
    public readonly code:
      | "XERO_KEY_REFUSED"
      | "NOT_FOUND"
      | "BAD_REQUEST"
      | "ALREADY_APPROVED"
      | "ALREADY_EXPORTED",
    message: string
  ) {
    super(message)
    this.name = "FinanceBillingWriteError"
  }
}

type FinanceExecutor = { execute: ReturnType<typeof getDb>["execute"] }

function financeDb(executor?: FinanceExecutor): FinanceExecutor {
  return executor ?? getDb()
}

export type FinanceBillingRecordSeed = {
  billing_type: string
  clients_id: number
  client_name: string
  mba_number?: string | null
  campaign_name?: string | null
  billing_month: string
  initial_total?: number
  initial_status?: string
  initial_payment_days?: number
  initial_payment_terms?: string
}

export type SetFinanceBillingRecordBilledInput = {
  invoiceKey: string
  billed: boolean
  billedBy: number | null
  billedAt: string | number | null
  billedAmountCents: number | null
  billedLinesHash: string | null
}

export type SetFinanceBillingRecordNotesInput = {
  invoiceKey: string
  notes: string
}

export type SetFinanceBillingRecordApprovedInput = {
  invoiceKey: string
  approvedBy: number
  approvedByName: string
  approvedAmountCents: number
  approvedLinesHash: string
  reapprove?: boolean
}

export type SetFinanceBillingRecordExportedInput = {
  invoiceKey: string
  exportedBy: number
}

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  if (
    result &&
    typeof result === "object" &&
    Array.isArray((result as { rows?: unknown }).rows)
  ) {
    return (result as { rows: T[] }).rows
  }
  return []
}

function asApiRecord(row: Record<string, unknown>): Record<string, unknown> {
  return mapFinanceBillingRecordFromPostgres(row)
}

function asApiLineItem(row: Record<string, unknown>): Record<string, unknown> {
  return mapFinanceBillingLineItemFromPostgres(row)
}

export function isXeroInvoiceKey(invoiceKey: string): boolean {
  return invoiceKey.startsWith("xero:")
}

function assertAppInvoiceKey(invoiceKey: string): void {
  if (!invoiceKey || isXeroInvoiceKey(invoiceKey)) {
    throw new FinanceBillingWriteError(
      "XERO_KEY_REFUSED",
      "App writes must not touch finance_billing_records rows whose invoice_key starts with xero:."
    )
  }
}

function toTimestamptz(value: string | number | null | undefined): string | null {
  if (value == null || value === "") return null
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString()
  }
  const s = String(value).trim()
  return s || null
}

function numOrNull(value: unknown): number | null {
  if (value == null || value === "") return null
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function dollarsToCentsMaybe(value: unknown): number | null {
  const dollars = numOrNull(value)
  if (dollars == null) return null
  const scaled = dollars * 100
  const floored = Math.floor(scaled)
  const diff = scaled - floored
  if (diff > 0.5) return floored + 1
  if (diff < 0.5) return floored
  return floored % 2 === 0 ? floored : floored + 1
}

async function loadInvoiceKeyByRecordId(id: number): Promise<string | null> {
  const db = getDb()
  const rows = rowsOf<{ invoice_key: string | null }>(
    await db.execute(sql`
      SELECT invoice_key FROM finance_billing_records WHERE id = ${id} LIMIT 1
    `)
  )
  const key = rows[0]?.invoice_key
  return typeof key === "string" ? key : null
}

async function loadInvoiceKeyByLineItemId(id: number): Promise<string | null> {
  const db = getDb()
  const rows = rowsOf<{ invoice_key: string | null }>(
    await db.execute(sql`
      SELECT r.invoice_key
      FROM finance_billing_line_items li
      JOIN finance_billing_records r ON r.id = li.finance_billing_records_id
      WHERE li.id = ${id}
      LIMIT 1
    `)
  )
  const key = rows[0]?.invoice_key
  return typeof key === "string" ? key : null
}

/**
 * Insert-or-return by invoice_key. Conflict does not overwrite billed/notes
 * (ensure semantics). xero: keys are refused by assertAppInvoiceKey before
 * the INSERT — the no-op DO UPDATE exists so RETURNING still yields the row.
 */
export async function upsertFinanceBillingRecordByInvoiceKey(
  invoiceKey: string,
  values: FinanceBillingRecordSeed,
  executor?: FinanceExecutor
): Promise<Record<string, unknown>> {
  assertAppInvoiceKey(invoiceKey)
  const db = financeDb(executor)
  const total =
    typeof values.initial_total === "number" && Number.isFinite(values.initial_total)
      ? values.initial_total
      : 0
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      INSERT INTO finance_billing_records (
        invoice_key, clients_id, client_name, billing_type, mba_number,
        campaign_name, po_number, billing_month, invoice_date, payment_days,
        payment_terms, status, total, billed, billed_at, billed_by,
        has_pending_edits, source_billing_schedule_id, notes, updated_at,
        billed_amount_cents, billed_lines_hash
      ) VALUES (
        ${invoiceKey},
        ${values.clients_id},
        ${values.client_name},
        ${values.billing_type},
        ${values.mba_number ?? ""},
        ${values.campaign_name ?? ""},
        ${""},
        ${values.billing_month},
        ${null}::date,
        ${values.initial_payment_days ?? 30},
        ${values.initial_payment_terms ?? "Net 30 days"},
        ${values.initial_status ?? "draft"},
        ${total.toFixed(2)},
        false,
        ${null}::timestamptz,
        ${null}::bigint,
        false,
        0,
        ${""},
        now(),
        ${null}::bigint,
        ${null}
      )
      ON CONFLICT (invoice_key) DO UPDATE SET
        updated_at = finance_billing_records.updated_at
      RETURNING *
    `)
  )
  const row = rows[0]
  if (!row) {
    throw new FinanceBillingWriteError(
      "XERO_KEY_REFUSED",
      "Upsert did not return a row (xero: guard or missing invoice_key)."
    )
  }
  return asApiRecord(row)
}

export async function setFinanceBillingRecordBilled(
  input: SetFinanceBillingRecordBilledInput,
  executor?: FinanceExecutor
): Promise<Record<string, unknown>> {
  assertAppInvoiceKey(input.invoiceKey)
  const db = financeDb(executor)
  const billedAt = input.billed ? toTimestamptz(input.billedAt) : null
  const billedBy = input.billed ? input.billedBy : null
  const cents = input.billed ? input.billedAmountCents : null
  const hash = input.billed ? input.billedLinesHash : null
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      UPDATE finance_billing_records SET
        billed = ${input.billed},
        billed_at = ${billedAt}::timestamptz,
        billed_by = ${billedBy},
        billed_amount_cents = ${cents},
        billed_lines_hash = ${hash},
        updated_at = now()
      WHERE invoice_key = ${input.invoiceKey}
        AND invoice_key NOT LIKE 'xero:%'
      RETURNING *
    `)
  )
  const row = rows[0]
  if (!row) {
    throw new FinanceBillingWriteError(
      "NOT_FOUND",
      `finance_billing_records invoice_key=${input.invoiceKey} not found`
    )
  }
  return asApiRecord(row)
}

export async function setFinanceBillingRecordNotes(
  input: SetFinanceBillingRecordNotesInput,
  executor?: FinanceExecutor
): Promise<Record<string, unknown>> {
  assertAppInvoiceKey(input.invoiceKey)
  const db = financeDb(executor)
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      UPDATE finance_billing_records SET
        notes = ${input.notes},
        updated_at = now()
      WHERE invoice_key = ${input.invoiceKey}
        AND invoice_key NOT LIKE 'xero:%'
      RETURNING *
    `)
  )
  const row = rows[0]
  if (!row) {
    throw new FinanceBillingWriteError(
      "NOT_FOUND",
      `finance_billing_records invoice_key=${input.invoiceKey} not found`
    )
  }
  return asApiRecord(row)
}

async function loadApprovalExportStamps(
  invoiceKey: string,
  executor?: FinanceExecutor
): Promise<{ approved_at: string | null; exported_at: string | null } | null> {
  const db = financeDb(executor)
  const rows = rowsOf<{ approved_at: string | null; exported_at: string | null }>(
    await db.execute(sql`
      SELECT approved_at, exported_at
      FROM finance_billing_records
      WHERE invoice_key = ${invoiceKey}
        AND invoice_key NOT LIKE 'xero:%'
      LIMIT 1
    `)
  )
  return rows[0] ?? null
}

export async function setFinanceBillingRecordApproved(
  input: SetFinanceBillingRecordApprovedInput,
  executor?: FinanceExecutor
): Promise<Record<string, unknown>> {
  assertAppInvoiceKey(input.invoiceKey)
  const db = financeDb(executor)
  const reapprove = input.reapprove === true
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      UPDATE finance_billing_records SET
        approved_at = now(),
        approved_by = ${input.approvedBy},
        approved_by_name = ${input.approvedByName},
        approved_amount_cents = ${input.approvedAmountCents},
        approved_lines_hash = ${input.approvedLinesHash},
        updated_at = now()
      WHERE invoice_key = ${input.invoiceKey}
        AND invoice_key NOT LIKE 'xero:%'
        AND (${reapprove} OR approved_at IS NULL)
      RETURNING *
    `)
  )
  const row = rows[0]
  if (!row) {
    const existing = await loadApprovalExportStamps(input.invoiceKey, executor)
    if (!existing) {
      throw new FinanceBillingWriteError(
        "NOT_FOUND",
        `finance_billing_records invoice_key=${input.invoiceKey} not found`
      )
    }
    throw new FinanceBillingWriteError(
      "ALREADY_APPROVED",
      "Already approved. Pass reapprove: true to overwrite the snapshot."
    )
  }
  return asApiRecord(row)
}

export async function clearFinanceBillingRecordApproval(
  invoiceKey: string,
  executor?: FinanceExecutor
): Promise<Record<string, unknown>> {
  assertAppInvoiceKey(invoiceKey)
  const db = financeDb(executor)
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      UPDATE finance_billing_records SET
        approved_at = NULL,
        approved_by = NULL,
        approved_by_name = NULL,
        approved_amount_cents = NULL,
        approved_lines_hash = NULL,
        updated_at = now()
      WHERE invoice_key = ${invoiceKey}
        AND invoice_key NOT LIKE 'xero:%'
        AND exported_at IS NULL
      RETURNING *
    `)
  )
  const row = rows[0]
  if (!row) {
    const existing = await loadApprovalExportStamps(invoiceKey, executor)
    if (!existing) {
      throw new FinanceBillingWriteError(
        "NOT_FOUND",
        `finance_billing_records invoice_key=${invoiceKey} not found`
      )
    }
    if (existing.exported_at) {
      throw new FinanceBillingWriteError(
        "ALREADY_EXPORTED",
        "This invoice has been exported. Amend the schedule and re-approve instead of unapproving."
      )
    }
    throw new FinanceBillingWriteError(
      "NOT_FOUND",
      `finance_billing_records invoice_key=${invoiceKey} not found`
    )
  }
  return asApiRecord(row)
}

export async function setFinanceBillingRecordExported(
  input: SetFinanceBillingRecordExportedInput,
  executor?: FinanceExecutor
): Promise<Record<string, unknown>> {
  assertAppInvoiceKey(input.invoiceKey)
  const db = financeDb(executor)
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      UPDATE finance_billing_records SET
        exported_at = now(),
        exported_by = ${input.exportedBy},
        updated_at = now()
      WHERE invoice_key = ${input.invoiceKey}
        AND invoice_key NOT LIKE 'xero:%'
      RETURNING *
    `)
  )
  const row = rows[0]
  if (!row) {
    throw new FinanceBillingWriteError(
      "NOT_FOUND",
      `finance_billing_records invoice_key=${input.invoiceKey} not found`
    )
  }
  return asApiRecord(row)
}

export async function materialiseAndApproveFinanceBillingRecord(input: {
  invoiceKey: string
  seed: FinanceBillingRecordSeed
  approvedBy: number
  approvedByName: string
  approvedAmountCents: number
  approvedLinesHash: string
  reapprove?: boolean
}): Promise<Record<string, unknown>> {
  const db = getDb()
  return db.transaction(async (tx) => {
    await upsertFinanceBillingRecordByInvoiceKey(input.invoiceKey, input.seed, tx)
    return setFinanceBillingRecordApproved(
      {
        invoiceKey: input.invoiceKey,
        approvedBy: input.approvedBy,
        approvedByName: input.approvedByName,
        approvedAmountCents: input.approvedAmountCents,
        approvedLinesHash: input.approvedLinesHash,
        reapprove: input.reapprove,
      },
      tx
    )
  })
}

function patchCentsFromBody(body: Record<string, unknown>): number | undefined {
  if ("billed_amount_cents" in body) {
    const n = numOrNull(body.billed_amount_cents)
    return n == null ? undefined : n
  }
  if ("billed_amount" in body) {
    const n = dollarsToCentsMaybe(body.billed_amount)
    return n == null ? undefined : n
  }
  return undefined
}

export async function patchFinanceBillingRecordById(
  id: number,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!Number.isFinite(id) || id <= 0) {
    throw new FinanceBillingWriteError("BAD_REQUEST", "id must be a positive number")
  }
  const existingKey = await loadInvoiceKeyByRecordId(id)
  if (existingKey == null) {
    throw new FinanceBillingWriteError("NOT_FOUND", `finance_billing_records id=${id} not found`)
  }
  assertAppInvoiceKey(existingKey)

  const cents = patchCentsFromBody(body)
  const billedAt =
    "billed_at" in body ? toTimestamptz(body.billed_at as string | number | null) : undefined

  const db = getDb()
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      UPDATE finance_billing_records SET
        client_name = COALESCE(${"client_name" in body ? String(body.client_name ?? "") : null}, client_name),
        mba_number = COALESCE(${"mba_number" in body ? String(body.mba_number ?? "") : null}, mba_number),
        campaign_name = COALESCE(${"campaign_name" in body ? String(body.campaign_name ?? "") : null}, campaign_name),
        po_number = COALESCE(${"po_number" in body ? String(body.po_number ?? "") : null}, po_number),
        billing_month = COALESCE(${"billing_month" in body ? String(body.billing_month ?? "") : null}, billing_month),
        invoice_date = COALESCE(${"invoice_date" in body ? (body.invoice_date as string | null) : null}::date, invoice_date),
        payment_days = COALESCE(${"payment_days" in body ? numOrNull(body.payment_days) : null}::bigint, payment_days),
        payment_terms = COALESCE(${"payment_terms" in body ? String(body.payment_terms ?? "") : null}, payment_terms),
        status = COALESCE(${"status" in body ? String(body.status ?? "") : null}, status),
        total = COALESCE(${"total" in body ? numOrNull(body.total) : null}, total),
        has_pending_edits = COALESCE(${"has_pending_edits" in body ? Boolean(body.has_pending_edits) : null}::boolean, has_pending_edits),
        billed = COALESCE(${"billed" in body ? Boolean(body.billed) : null}::boolean, billed),
        billed_at = COALESCE(${billedAt !== undefined ? billedAt : null}::timestamptz, billed_at),
        billed_by = COALESCE(${"billed_by" in body ? numOrNull(body.billed_by) : null}::bigint, billed_by),
        billed_amount_cents = COALESCE(${cents ?? null}::bigint, billed_amount_cents),
        billed_lines_hash = COALESCE(${"billed_lines_hash" in body ? (body.billed_lines_hash as string | null) : null}, billed_lines_hash),
        notes = COALESCE(${"notes" in body ? String(body.notes ?? "") : null}, notes),
        updated_at = now()
      WHERE id = ${id}
        AND invoice_key NOT LIKE 'xero:%'
      RETURNING *
    `)
  )
  const row = rows[0]
  if (!row) {
    throw new FinanceBillingWriteError(
      "XERO_KEY_REFUSED",
      `Refused to patch finance_billing_records id=${id}`
    )
  }
  return asApiRecord(row)
}

export async function createFinanceBillingLineItem(
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const parentId = numOrNull(body.finance_billing_records_id)
  if (parentId == null || parentId <= 0) {
    throw new FinanceBillingWriteError(
      "BAD_REQUEST",
      "finance_billing_records_id is required"
    )
  }
  const parentKey = await loadInvoiceKeyByRecordId(parentId)
  if (parentKey == null) {
    throw new FinanceBillingWriteError(
      "NOT_FOUND",
      `finance_billing_records id=${parentId} not found`
    )
  }
  assertAppInvoiceKey(parentKey)

  const db = getDb()
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      INSERT INTO finance_billing_line_items (
        finance_billing_records_id, item_code, line_type, media_type,
        description, publisher_name, amount, client_pays_media, sort_order,
        updated_at, line_item_id, line_status, received_at, received_amount,
        note, orphaned, media_plan_version_number
      ) VALUES (
        ${parentId},
        ${String(body.item_code ?? "")},
        ${String(body.line_type ?? "media")},
        ${body.media_type == null ? null : String(body.media_type)},
        ${body.description == null ? null : String(body.description)},
        ${body.publisher_name == null ? null : String(body.publisher_name)},
        ${numOrNull(body.amount) ?? 0},
        ${Boolean(body.client_pays_media)},
        ${numOrNull(body.sort_order) ?? 0},
        now(),
        ${body.line_item_id == null ? null : String(body.line_item_id)},
        ${body.line_status == null ? null : String(body.line_status)},
        ${toTimestamptz(body.received_at as string | number | null)}::timestamptz,
        ${numOrNull(body.received_amount)},
        ${body.note == null ? null : String(body.note)},
        ${body.orphaned == null ? null : Boolean(body.orphaned)},
        ${numOrNull(body.media_plan_version_number)}
      )
      RETURNING *
    `)
  )
  const row = rows[0]
  if (!row) {
    throw new FinanceBillingWriteError("BAD_REQUEST", "line item insert returned no row")
  }
  return asApiLineItem(row)
}

export async function patchFinanceBillingLineItemById(
  id: number,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!Number.isFinite(id) || id <= 0) {
    throw new FinanceBillingWriteError("BAD_REQUEST", "id must be a positive number")
  }
  const parentKey = await loadInvoiceKeyByLineItemId(id)
  if (parentKey == null) {
    throw new FinanceBillingWriteError("NOT_FOUND", `finance_billing_line_items id=${id} not found`)
  }
  assertAppInvoiceKey(parentKey)

  const db = getDb()
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      UPDATE finance_billing_line_items SET
        item_code = COALESCE(${"item_code" in body ? String(body.item_code ?? "") : null}, item_code),
        line_type = COALESCE(${"line_type" in body ? String(body.line_type ?? "") : null}, line_type),
        media_type = COALESCE(${"media_type" in body ? (body.media_type as string | null) : null}, media_type),
        description = COALESCE(${"description" in body ? (body.description as string | null) : null}, description),
        publisher_name = COALESCE(${"publisher_name" in body ? (body.publisher_name as string | null) : null}, publisher_name),
        amount = COALESCE(${"amount" in body ? numOrNull(body.amount) : null}, amount),
        client_pays_media = COALESCE(${"client_pays_media" in body ? Boolean(body.client_pays_media) : null}::boolean, client_pays_media),
        sort_order = COALESCE(${"sort_order" in body ? numOrNull(body.sort_order) : null}::bigint, sort_order),
        line_item_id = COALESCE(${"line_item_id" in body ? (body.line_item_id as string | null) : null}, line_item_id),
        line_status = COALESCE(${"line_status" in body ? (body.line_status as string | null) : null}, line_status),
        received_at = COALESCE(${"received_at" in body ? toTimestamptz(body.received_at as string | number | null) : null}::timestamptz, received_at),
        received_amount = COALESCE(${"received_amount" in body ? numOrNull(body.received_amount) : null}, received_amount),
        note = COALESCE(${"note" in body ? (body.note as string | null) : null}, note),
        orphaned = COALESCE(${"orphaned" in body ? Boolean(body.orphaned) : null}::boolean, orphaned),
        media_plan_version_number = COALESCE(${"media_plan_version_number" in body ? numOrNull(body.media_plan_version_number) : null}::bigint, media_plan_version_number),
        updated_at = now()
      WHERE id = ${id}
      RETURNING *
    `)
  )
  const row = rows[0]
  if (!row) {
    throw new FinanceBillingWriteError("NOT_FOUND", `finance_billing_line_items id=${id} not found`)
  }
  return asApiLineItem(row)
}

export async function deleteFinanceBillingLineItemById(id: number): Promise<void> {
  if (!Number.isFinite(id) || id <= 0) {
    throw new FinanceBillingWriteError("BAD_REQUEST", "id must be a positive number")
  }
  const parentKey = await loadInvoiceKeyByLineItemId(id)
  if (parentKey == null) {
    throw new FinanceBillingWriteError("NOT_FOUND", `finance_billing_line_items id=${id} not found`)
  }
  assertAppInvoiceKey(parentKey)
  const db = getDb()
  await db.execute(sql`DELETE FROM finance_billing_line_items WHERE id = ${id}`)
}
