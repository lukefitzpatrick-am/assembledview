import "server-only"

import { sql } from "drizzle-orm"

import { getDb } from "@/db"
import { rowsOf } from "@/lib/xero/dbRows"

const PAGE_SIZE_CAP = 500
const EXCEPTIONS_ISSUE_DATE_MIN = "2025-07-01"

export { EXCEPTIONS_ISSUE_DATE_MIN, PAGE_SIZE_CAP }

export class XeroQueueError extends Error {
  constructor(
    readonly code:
      | "mba_required"
      | "mba_not_found"
      | "invoice_not_found"
      | "exception_not_open"
      | "exception_not_found",
    message: string
  ) {
    super(message)
    this.name = "XeroQueueError"
  }
}

type QueryExecutor = {
  execute: (query: ReturnType<typeof sql>) => Promise<unknown>
}

type TransactionDb = {
  transaction: <T>(fn: (tx: QueryExecutor) => Promise<T>) => Promise<T>
}

export type OpenXeroException = {
  id: number
  xero_invoice_id: string | null
  invoice_number: string | null
  reference: string | null
  reason: string | null
  issue_date: string | null
  created_at: string | null
  resolved: boolean | null
  contact_name: string | null
  /** Ex-GST. `xero_ar_invoices.sub_total`. */
  amount: string | number | null
  /** Inc-GST. `xero_ar_invoices.total`. */
  total_inc_gst: string | number | null
}

/**
 * Open exceptions, newest first. `amount` is ex-GST `sub_total`; `total` is
 * returned as `total_inc_gst`. Issue-date floor matches the exceptions panel.
 */
export async function listOpenXeroExceptions(
  executor?: QueryExecutor
): Promise<OpenXeroException[]> {
  const db = executor ?? getDb()
  return rowsOf<OpenXeroException>(
    await db.execute(sql`
      SELECT
        e.id,
        e.xero_invoice_id,
        e.invoice_number,
        COALESCE(NULLIF(btrim(i.reference_raw), ''), e.reference) AS reference,
        e.reason,
        e.issue_date,
        e.created_at,
        e.resolved,
        c.name AS contact_name,
        i.sub_total AS amount,
        i.total AS total_inc_gst
      FROM xero_sync_exceptions e
      LEFT JOIN xero_ar_invoices i ON i.xero_invoice_id = e.xero_invoice_id
      LEFT JOIN xero_contacts c ON c.xero_contact_id = i.xero_contact_id
      WHERE e.resolved IS NOT TRUE
        AND e.issue_date >= ${EXCEPTIONS_ISSUE_DATE_MIN}
      ORDER BY e.created_at DESC NULLS LAST, e.id DESC
      LIMIT ${PAGE_SIZE_CAP}
    `)
  )
}

type AssignTarget = { exceptionId: number | null; xeroInvoiceId: string }

async function loadAssignTarget(tx: QueryExecutor, id: number): Promise<AssignTarget> {
  const byException = rowsOf<{ id: number; xero_invoice_id: string | null }>(
    await tx.execute(sql`
      SELECT id, xero_invoice_id
      FROM xero_sync_exceptions
      WHERE id = ${id}
        AND resolved IS NOT TRUE
      LIMIT 1
    `)
  )
  const direct = byException[0]
  if (direct?.xero_invoice_id) {
    return { exceptionId: Number(direct.id), xeroInvoiceId: String(direct.xero_invoice_id) }
  }

  const billing = rowsOf<{ xero_invoice_id: string | null }>(
    await tx.execute(sql`
      SELECT substring(b.invoice_key FROM 6) AS xero_invoice_id
      FROM finance_billing_records b
      WHERE b.id = ${id}
        AND b.invoice_key LIKE 'xero:%'
      LIMIT 1
    `)
  )
  const xeroInvoiceId = billing[0]?.xero_invoice_id
  if (!xeroInvoiceId) {
    throw new XeroQueueError("invoice_not_found", `No xero invoice for id ${id}.`)
  }

  const open = rowsOf<{ id: number }>(
    await tx.execute(sql`
      SELECT e.id
      FROM xero_sync_exceptions e
      WHERE e.xero_invoice_id = ${String(xeroInvoiceId)}
        AND e.resolved IS NOT TRUE
      ORDER BY e.created_at DESC NULLS LAST, e.id DESC
      LIMIT 1
    `)
  )
  return {
    exceptionId: open[0] ? Number(open[0].id) : null,
    xeroInvoiceId: String(xeroInvoiceId),
  }
}

export type AssignMbaResult = {
  exceptionId: number | null
  mbaNumber: string
  masterId: number
  invoiceId: number
  resolved_exception: boolean
}

/**
 * Validate the MBA and stamp it on the AR invoice. When that invoice has an
 * open exception, close it in the same transaction. A billing-record id whose
 * invoice has no open exception still writes `mba_number` and `mba_match_id`
 * and returns `resolved_exception: false`. An unknown invoice is
 * `invoice_not_found`. A thrown error rolls the writes back.
 * `id` is an open exception id, or a finance_billing_records id whose
 * invoice_key is `xero:{invoice}`.
 */
export async function assignMbaAndResolveException(
  input: { id: number; mbaNumber: string; resolvedBy: string },
  db: TransactionDb = getDb()
): Promise<AssignMbaResult> {
  const mba = input.mbaNumber.trim()
  if (!mba) {
    throw new XeroQueueError("mba_required", "mba_number is required.")
  }

  return db.transaction(async (tx) => {
    const masters = rowsOf<{ id: number; mba_number: string }>(
      await tx.execute(sql`
        SELECT id, mba_number
        FROM media_plan_masters
        WHERE lower(btrim(mba_number)) = lower(btrim(${mba}))
        LIMIT 1
      `)
    )
    const master = masters[0]
    if (!master) {
      throw new XeroQueueError("mba_not_found", `No media plan master for MBA ${mba}.`)
    }
    const masterId = Number(master.id)
    const storedMba = String(master.mba_number ?? mba).trim()

    const target = await loadAssignTarget(tx, input.id)

    const invoices = rowsOf<{ id: number }>(
      await tx.execute(sql`
        UPDATE xero_ar_invoices
        SET mba_number = ${storedMba},
            mba_match_id = ${masterId}
        WHERE xero_invoice_id = ${target.xeroInvoiceId}
        RETURNING id
      `)
    )
    const invoice = invoices[0]
    if (!invoice) {
      throw new XeroQueueError(
        "invoice_not_found",
        `No xero_ar_invoices row for ${target.xeroInvoiceId}.`
      )
    }

    if (target.exceptionId == null) {
      return {
        exceptionId: null,
        mbaNumber: storedMba,
        masterId,
        invoiceId: Number(invoice.id),
        resolved_exception: false,
      }
    }

    const closed = rowsOf<{ id: number }>(
      await tx.execute(sql`
        UPDATE xero_sync_exceptions
        SET resolved = true,
            resolved_at = now(),
            resolved_by = ${input.resolvedBy},
            resolution = 'assign_mba'
        WHERE id = ${target.exceptionId}
          AND resolved IS NOT TRUE
        RETURNING id
      `)
    )
    if (closed.length === 0) {
      throw new XeroQueueError(
        "exception_not_open",
        `xero_sync_exceptions id=${target.exceptionId} is not open.`
      )
    }

    return {
      exceptionId: target.exceptionId,
      mbaNumber: storedMba,
      masterId,
      invoiceId: Number(invoice.id),
      resolved_exception: true,
    }
  })
}

export async function resolveXeroException(
  input: { id: number; resolvedBy: string; resolution: "resolved" | "dismissed" },
  db: TransactionDb = getDb()
): Promise<{ id: number }> {
  return db.transaction(async (tx) => {
    const closed = rowsOf<{ id: number }>(
      await tx.execute(sql`
        UPDATE xero_sync_exceptions
        SET resolved = true,
            resolved_at = now(),
            resolved_by = ${input.resolvedBy},
            resolution = ${input.resolution}
        WHERE id = ${input.id}
          AND resolved IS NOT TRUE
        RETURNING id
      `)
    )
    if (closed.length === 0) {
      throw new XeroQueueError(
        "exception_not_open",
        `xero_sync_exceptions id=${input.id} is not open.`
      )
    }
    return { id: Number(closed[0].id) }
  })
}
