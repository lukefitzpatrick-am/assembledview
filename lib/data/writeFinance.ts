/**
 * finance_billing_records / finance_billing_line_items mutate path (T0-1).
 * Postgres only. Natural key is invoice_key. Never writes xero: rows —
 * those belong to lib/xero/stages/importBillingRecords.ts.
 * Xero match stamps (`setFinanceBillingRecordXeroMatch`) never touch approved_*.
 * An unchanged `matched_xero_invoice_id` does not rewrite `matched_at`.
 * An auto stamp that hits a manual match (or a different invoice) returns
 * skipped rather than NOT_FOUND, so persistAutoStamps can keep going.
 * Unmark-exported (`clearFinanceBillingRecordExported`) never touches approved_*.
 * PATCH-by-id is field-allowlisted (notes, po_number, payment_days, payment_terms,
 * status, invoice_date, campaign_name). Money and lifecycle stamps are refused.
 * Line-item amount / received_amount freeze once the parent is approved.
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
      | "ALREADY_EXPORTED"
      | "NOT_APPROVED"
      | "NOT_EXPORTED"
      | "FIELD_NOT_ALLOWED"
      | "APPROVED_FROZEN",
    message: string,
    public readonly field?: string
  ) {
    super(message)
    this.name = "FinanceBillingWriteError"
  }
}

export type FinanceExecutor = { execute: ReturnType<typeof getDb>["execute"] }

export type ClearFinanceBillingApprovalResult = {
  record: Record<string, unknown>
  priorApprovedAt: string | null
}

export type ClearFinanceBillingExportedResult = {
  record: Record<string, unknown>
  priorExportedAt: string | null
}

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

export type SetFinanceBillingRecordXeroMatchInput = {
  invoiceKey: string
  xeroInvoiceId: string
  matchedBy: "auto" | "manual"
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

type ParentStamp = {
  invoice_key: string
  approved_at: string | null
}

async function loadInvoiceKeyByRecordId(id: number): Promise<string | null> {
  const parent = await loadParentStampByRecordId(id)
  return parent?.invoice_key ?? null
}

async function loadParentStampByRecordId(id: number): Promise<ParentStamp | null> {
  const db = getDb()
  const rows = rowsOf<{ invoice_key: string | null; approved_at: string | null }>(
    await db.execute(sql`
      SELECT invoice_key, approved_at
      FROM finance_billing_records
      WHERE id = ${id}
      LIMIT 1
    `)
  )
  const key = rows[0]?.invoice_key
  if (typeof key !== "string") return null
  return { invoice_key: key, approved_at: rows[0]?.approved_at ?? null }
}

async function loadInvoiceKeyByLineItemId(id: number): Promise<string | null> {
  const parent = await loadParentStampByLineItemId(id)
  return parent?.invoice_key ?? null
}

async function loadParentStampByLineItemId(id: number): Promise<ParentStamp | null> {
  const db = getDb()
  const rows = rowsOf<{ invoice_key: string | null; approved_at: string | null }>(
    await db.execute(sql`
      SELECT r.invoice_key, r.approved_at
      FROM finance_billing_line_items li
      JOIN finance_billing_records r ON r.id = li.finance_billing_records_id
      WHERE li.id = ${id}
      LIMIT 1
    `)
  )
  const key = rows[0]?.invoice_key
  if (typeof key !== "string") return null
  return { invoice_key: key, approved_at: rows[0]?.approved_at ?? null }
}

const PATCH_RECORD_ALLOWED_FIELDS = new Set([
  "notes",
  "po_number",
  "payment_days",
  "payment_terms",
  "status",
  "invoice_date",
  "campaign_name",
])

function assertPatchRecordAllowlist(body: Record<string, unknown>): void {
  const rejected = Object.keys(body).find((key) => !PATCH_RECORD_ALLOWED_FIELDS.has(key))
  if (rejected) {
    throw new FinanceBillingWriteError(
      "FIELD_NOT_ALLOWED",
      `PATCH does not accept field '${rejected}'`,
      rejected
    )
  }
}

function throwApprovedMoneyFrozen(field: string): never {
  throw new FinanceBillingWriteError(
    "APPROVED_FROZEN",
    `Cannot write '${field}' after the parent invoice is approved. Unapprove to amend.`,
    field
  )
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
): Promise<ClearFinanceBillingApprovalResult> {
  assertAppInvoiceKey(invoiceKey)
  const prior = await loadApprovalExportStamps(invoiceKey, executor)
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
    if (!prior) {
      throw new FinanceBillingWriteError(
        "NOT_FOUND",
        `finance_billing_records invoice_key=${invoiceKey} not found`
      )
    }
    if (prior.exported_at) {
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
  return {
    record: asApiRecord(row),
    priorApprovedAt: prior?.approved_at != null ? String(prior.approved_at) : null,
  }
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
        AND approved_at IS NOT NULL
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
    if (!existing.approved_at) {
      throw new FinanceBillingWriteError(
        "NOT_APPROVED",
        `finance_billing_records invoice_key=${input.invoiceKey} is not approved`
      )
    }
    throw new FinanceBillingWriteError(
      "NOT_FOUND",
      `finance_billing_records invoice_key=${input.invoiceKey} not found`
    )
  }
  return asApiRecord(row)
}

/**
 * Stamp exported_at on approved keys only. Unapproved keys are skipped, not
 * a batch failure — mark-as-sent is scoped to whatever is already approved.
 */
export async function stampExportedKeysSkippingUnapproved(
  invoiceKeys: string[],
  exportedBy: number,
  executor?: FinanceExecutor
): Promise<Array<{ invoiceKey: string; record: Record<string, unknown> }>> {
  const stamped: Array<{ invoiceKey: string; record: Record<string, unknown> }> = []
  for (const invoiceKey of invoiceKeys) {
    try {
      const record = await setFinanceBillingRecordExported(
        { invoiceKey, exportedBy },
        executor
      )
      stamped.push({ invoiceKey, record })
    } catch (error: unknown) {
      if (error instanceof FinanceBillingWriteError && error.code === "NOT_APPROVED") {
        continue
      }
      throw error
    }
  }
  return stamped
}

/**
 * Clear exported_at / exported_by only. Never touches approved_*.
 */
export async function clearFinanceBillingRecordExported(
  invoiceKey: string,
  executor?: FinanceExecutor
): Promise<ClearFinanceBillingExportedResult> {
  assertAppInvoiceKey(invoiceKey)
  const prior = await loadApprovalExportStamps(invoiceKey, executor)
  const db = financeDb(executor)
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      UPDATE finance_billing_records SET
        exported_at = NULL,
        exported_by = NULL,
        updated_at = now()
      WHERE invoice_key = ${invoiceKey}
        AND invoice_key NOT LIKE 'xero:%'
        AND exported_at IS NOT NULL
      RETURNING *
    `)
  )
  const row = rows[0]
  if (!row) {
    if (!prior) {
      throw new FinanceBillingWriteError(
        "NOT_FOUND",
        `finance_billing_records invoice_key=${invoiceKey} not found`
      )
    }
    throw new FinanceBillingWriteError(
      "NOT_EXPORTED",
      `finance_billing_records invoice_key=${invoiceKey} is not marked sent to finance`
    )
  }
  return {
    record: asApiRecord(row),
    priorExportedAt: prior?.exported_at != null ? String(prior.exported_at) : null,
  }
}

/**
 * Stamp `matched_xero_invoice_id` on an app billing record.
 * Never writes `xero:` keys. Never touches the approval snapshot.
 */
export type XeroMatchWriteResult = {
  record: Record<string, unknown>
  unchanged: boolean
  skipped: boolean
}

export async function setFinanceBillingRecordXeroMatch(
  input: SetFinanceBillingRecordXeroMatchInput,
  executor?: FinanceExecutor
): Promise<XeroMatchWriteResult> {
  assertAppInvoiceKey(input.invoiceKey)
  const xeroInvoiceId = input.xeroInvoiceId.trim()
  if (!xeroInvoiceId) {
    throw new FinanceBillingWriteError("BAD_REQUEST", "xero_invoice_id is required.")
  }
  if (input.matchedBy !== "auto" && input.matchedBy !== "manual") {
    throw new FinanceBillingWriteError("BAD_REQUEST", "matched_by must be auto or manual.")
  }
  const db = financeDb(executor)
  const skipManual = input.matchedBy === "auto"
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      UPDATE finance_billing_records SET
        matched_xero_invoice_id = ${xeroInvoiceId},
        matched_at = now(),
        matched_by = ${input.matchedBy},
        updated_at = now()
      WHERE invoice_key = ${input.invoiceKey}
        AND invoice_key NOT LIKE 'xero:%'
        AND matched_xero_invoice_id IS DISTINCT FROM ${xeroInvoiceId}
        AND (
          ${skipManual} = false
          OR matched_by IS NULL
          OR btrim(matched_by) = ''
          OR matched_by = 'auto'
        )
      RETURNING *
    `)
  )
  const row = rows[0]
  if (row) return { record: asApiRecord(row), unchanged: false, skipped: false }

  const existing = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      SELECT *
      FROM finance_billing_records
      WHERE invoice_key = ${input.invoiceKey}
        AND invoice_key NOT LIKE 'xero:%'
    `)
  )[0]
  if (!existing) {
    throw new FinanceBillingWriteError(
      "NOT_FOUND",
      `finance_billing_records invoice_key=${input.invoiceKey} not found`
    )
  }
  const existingId = String(existing.matched_xero_invoice_id ?? "").trim()
  if (existingId === xeroInvoiceId) {
    return { record: asApiRecord(existing), unchanged: true, skipped: false }
  }
  // Auto cannot overwrite a manual match (or a different invoice the
  // skipManual predicate left in place). That is a skip, not a missing row.
  if (skipManual) {
    return { record: asApiRecord(existing), unchanged: false, skipped: true }
  }
  throw new FinanceBillingWriteError(
    "BAD_REQUEST",
    `finance_billing_records invoice_key=${input.invoiceKey} did not update`
  )
}

export async function materialiseAndApproveFinanceBillingRecord(
  input: {
    invoiceKey: string
    seed: FinanceBillingRecordSeed
    approvedBy: number
    approvedByName: string
    approvedAmountCents: number
    approvedLinesHash: string
    reapprove?: boolean
  },
  executor?: FinanceExecutor
): Promise<Record<string, unknown>> {
  const run = async (tx: FinanceExecutor) => {
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
  }
  if (executor) return run(executor)
  return getDb().transaction(async (tx) => run(tx))
}

export async function patchFinanceBillingRecordById(
  id: number,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!Number.isFinite(id) || id <= 0) {
    throw new FinanceBillingWriteError("BAD_REQUEST", "id must be a positive number")
  }
  assertPatchRecordAllowlist(body)
  const existingKey = await loadInvoiceKeyByRecordId(id)
  if (existingKey == null) {
    throw new FinanceBillingWriteError("NOT_FOUND", `finance_billing_records id=${id} not found`)
  }
  assertAppInvoiceKey(existingKey)

  const db = getDb()
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      UPDATE finance_billing_records SET
        campaign_name = COALESCE(${"campaign_name" in body ? String(body.campaign_name ?? "") : null}, campaign_name),
        po_number = COALESCE(${"po_number" in body ? String(body.po_number ?? "") : null}, po_number),
        invoice_date = COALESCE(${"invoice_date" in body ? (body.invoice_date as string | null) : null}::date, invoice_date),
        payment_days = COALESCE(${"payment_days" in body ? numOrNull(body.payment_days) : null}::bigint, payment_days),
        payment_terms = COALESCE(${"payment_terms" in body ? String(body.payment_terms ?? "") : null}, payment_terms),
        status = COALESCE(${"status" in body ? String(body.status ?? "") : null}, status),
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
  const parent = await loadParentStampByRecordId(parentId)
  if (parent == null) {
    throw new FinanceBillingWriteError(
      "NOT_FOUND",
      `finance_billing_records id=${parentId} not found`
    )
  }
  assertAppInvoiceKey(parent.invoice_key)
  if (parent.approved_at) {
    throwApprovedMoneyFrozen("amount" in body ? "amount" : "received_amount")
  }

  const db = getDb()
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      INSERT INTO finance_billing_line_items (
        finance_billing_records_id, item_code, line_type, media_type,
        description, publisher_name, amount, client_pays_media, sort_order,
        updated_at, line_item_id, line_status, received_at, received_amount,
        note, orphaned, media_plan_version_number
      )
      SELECT
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
      FROM finance_billing_records
      WHERE id = ${parentId}
        AND invoice_key NOT LIKE 'xero:%'
        AND approved_at IS NULL
      RETURNING *
    `)
  )
  const row = rows[0]
  if (!row) {
    const retry = await loadParentStampByRecordId(parentId)
    if (retry?.approved_at) throwApprovedMoneyFrozen("amount")
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
  const parent = await loadParentStampByLineItemId(id)
  if (parent == null) {
    throw new FinanceBillingWriteError("NOT_FOUND", `finance_billing_line_items id=${id} not found`)
  }
  assertAppInvoiceKey(parent.invoice_key)
  const moneyField =
    "amount" in body ? "amount" : "received_amount" in body ? "received_amount" : null
  if (moneyField && parent.approved_at) {
    throwApprovedMoneyFrozen(moneyField)
  }

  const db = getDb()
  const freezeMoney = moneyField != null
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      UPDATE finance_billing_line_items AS li SET
        item_code = COALESCE(${"item_code" in body ? String(body.item_code ?? "") : null}, li.item_code),
        line_type = COALESCE(${"line_type" in body ? String(body.line_type ?? "") : null}, li.line_type),
        media_type = COALESCE(${"media_type" in body ? (body.media_type as string | null) : null}, li.media_type),
        description = COALESCE(${"description" in body ? (body.description as string | null) : null}, li.description),
        publisher_name = COALESCE(${"publisher_name" in body ? (body.publisher_name as string | null) : null}, li.publisher_name),
        amount = COALESCE(${"amount" in body ? numOrNull(body.amount) : null}, li.amount),
        client_pays_media = COALESCE(${"client_pays_media" in body ? Boolean(body.client_pays_media) : null}::boolean, li.client_pays_media),
        sort_order = COALESCE(${"sort_order" in body ? numOrNull(body.sort_order) : null}::bigint, li.sort_order),
        line_item_id = COALESCE(${"line_item_id" in body ? (body.line_item_id as string | null) : null}, li.line_item_id),
        line_status = COALESCE(${"line_status" in body ? (body.line_status as string | null) : null}, li.line_status),
        received_at = COALESCE(${"received_at" in body ? toTimestamptz(body.received_at as string | number | null) : null}::timestamptz, li.received_at),
        received_amount = COALESCE(${"received_amount" in body ? numOrNull(body.received_amount) : null}, li.received_amount),
        note = COALESCE(${"note" in body ? (body.note as string | null) : null}, li.note),
        orphaned = COALESCE(${"orphaned" in body ? Boolean(body.orphaned) : null}::boolean, li.orphaned),
        media_plan_version_number = COALESCE(${"media_plan_version_number" in body ? numOrNull(body.media_plan_version_number) : null}::bigint, li.media_plan_version_number),
        updated_at = now()
      FROM finance_billing_records AS r
      WHERE li.id = ${id}
        AND r.id = li.finance_billing_records_id
        AND r.invoice_key NOT LIKE 'xero:%'
        AND (${freezeMoney} = false OR r.approved_at IS NULL)
      RETURNING li.*
    `)
  )
  const row = rows[0]
  if (!row) {
    const retry = await loadParentStampByLineItemId(id)
    if (retry?.approved_at && moneyField) throwApprovedMoneyFrozen(moneyField)
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
