/**
 * Saved manual bill line matches (`ap_bill_line_matches`, migration 0107,
 * MAR-4). Every read and write checks the 0107 marker first; until Luke runs
 * the 0107 SQL, reads return nothing and writes refuse.
 */

import "server-only"

import { eq, sql } from "drizzle-orm"

import { getDb } from "@/db"
import { apBillLineMatches, migrationMarkers } from "@/db/schema"
import { FINANCE_STATUS_INCLUDED_SQL } from "@/lib/finance/sections/financeCampaignStatus"
import {
  billLineForMatch,
  MANUAL_MATCH_MARKER,
  MANUAL_MATCH_NOT_READY_MESSAGE,
  monthToDate,
  type CreateManualMatchInput,
} from "@/lib/finance/sections/fixedCostMargin/bills/manualMatch"
import type { SavedBillLineMatch } from "@/lib/finance/sections/fixedCostMargin/bills/match"
import { PUBLISHER_IDENTITY_SQL } from "@/lib/finance/sections/publisherIdentitySql"
import { SCHEDULE_LINE_JOIN_SQL } from "@/lib/finance/sections/scheduleLineJoinSql"
import { IS_SERVICE_LINE_SQL } from "@/lib/finance/sections/serviceLineBucket"
import { PUBLISHED_VERSION_JOIN_SQL } from "@/lib/mediaplan/publishedVersionGuard"

export class ManualMatchError extends Error {
  constructor(
    readonly code: "NOT_READY" | "BILL_NOT_FOUND" | "BILL_LINE_NOT_FOUND" | "PLAN_LINE_NOT_FOUND" | "ALREADY_MATCHED" | "NOT_FOUND",
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = "ManualMatchError"
  }
}

function rows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[]
  const r = result as { rows?: Record<string, unknown>[] }
  return Array.isArray(r.rows) ? r.rows : []
}

function text(v: unknown): string {
  return v == null ? "" : String(v).trim()
}

function num(v: unknown): number {
  if (typeof v === "bigint") return Number(v)
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export type MarkerReader = (key: string) => Promise<boolean>

export const readManualMatchMarker: MarkerReader = async (key) => {
  const found = await getDb()
    .select({ key: migrationMarkers.key })
    .from(migrationMarkers)
    .where(eq(migrationMarkers.key, key))
    .limit(1)
  return found.length > 0
}

/** True once migration_markers holds 0107. A failed read counts as not ready. */
export async function isManualMatchReady(reader: MarkerReader = readManualMatchMarker): Promise<boolean> {
  try {
    return await reader(MANUAL_MATCH_MARKER)
  } catch (error) {
    console.warn("[fixed-cost-margin] 0107 marker read failed", error)
    return false
  }
}

async function assertReady(): Promise<void> {
  if (!(await isManualMatchReady())) throw new ManualMatchError("NOT_READY", MANUAL_MATCH_NOT_READY_MESSAGE, 409)
}

/** Every saved match (empty until 0107 runs). */
export async function listSavedBillLineMatches(): Promise<SavedBillLineMatch[]> {
  if (!(await isManualMatchReady())) return []
  const result = await getDb().execute(sql`
    SELECT id, xero_invoice_id, xero_line_item_id, LOWER(BTRIM(mba_number)) AS mba_number,
      LOWER(BTRIM(line_item_id)) AS line_item_id, to_char(month, 'YYYY-MM') AS month,
      amount_cents, matched_by, to_char(matched_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS matched_at, note
    FROM ap_bill_line_matches
    ORDER BY id
  `)
  return rows(result).map((r) => ({
    id: num(r.id),
    xeroInvoiceId: text(r.xero_invoice_id),
    xeroLineItemId: text(r.xero_line_item_id),
    mbaNumber: text(r.mba_number),
    lineItemId: text(r.line_item_id),
    month: text(r.month),
    amountCents: num(r.amount_cents),
    matchedBy: text(r.matched_by),
    matchedAt: text(r.matched_at),
    note: text(r.note) || null,
  }))
}

export type MatchPlanLineOption = {
  lineItemId: string
  publisher: string
  buyType: string
  fixedCost: boolean
  /** Billed media cents by YYYY-MM (billing basis). */
  billedByMonth: Record<string, number>
}

/** Media lines of an MBA's published tip (approved, booked, completed), for the picker and the save check. */
export async function loadMatchPlanLines(mbaNumber: string): Promise<MatchPlanLineOption[]> {
  const mba = mbaNumber.trim().toLowerCase()
  if (!mba) return []
  const publisherExpr = `COALESCE(${PUBLISHER_IDENTITY_SQL.trim()}, '')`
  const result = await getDb().execute(sql`
    SELECT LOWER(BTRIM(li.line_item_id)) AS line_item_id,
      ${sql.raw(publisherExpr)} AS publisher,
      LOWER(COALESCE(li.buy_type, '')) AS buy_type,
      (COALESCE(li.fixed_cost_media, FALSE) = TRUE OR LOWER(BTRIM(COALESCE(li.buy_type, ''))) = 'fixed_cost') AS fixed_cost,
      to_char(date_trunc('month', sm.month)::date, 'YYYY-MM') AS month,
      SUM(sm.amount_cents)::bigint AS amount_cents
    FROM media_plan_masters m
    INNER JOIN media_plan_versions v ON ${sql.raw(PUBLISHED_VERSION_JOIN_SQL)}
    INNER JOIN schedule_months sm ON sm.version_id = v.id
      AND sm.component = 'media'
      AND sm.basis = 'billing'
    INNER JOIN line_items li ON ${sql.raw(SCHEDULE_LINE_JOIN_SQL)}
    WHERE m.published_version_id IS NOT NULL
      AND LOWER(BTRIM(m.mba_number)) = ${mba}
      AND ${sql.raw(FINANCE_STATUS_INCLUDED_SQL)}
      AND NOT ${sql.raw(IS_SERVICE_LINE_SQL)}
    GROUP BY 1, 2, 3, 4, 5
    ORDER BY 1, 5
  `)
  const byLine = new Map<string, MatchPlanLineOption>()
  for (const r of rows(result)) {
    const lid = text(r.line_item_id)
    if (!lid) continue
    const line =
      byLine.get(lid) ??
      ({ lineItemId: lid, publisher: text(r.publisher), buyType: text(r.buy_type), fixedCost: r.fixed_cost === true || r.fixed_cost === "t", billedByMonth: {} } satisfies MatchPlanLineOption)
    const month = text(r.month)
    if (month) line.billedByMonth[month] = (line.billedByMonth[month] ?? 0) + num(r.amount_cents)
    byLine.set(lid, line)
  }
  return [...byLine.values()].sort((a, b) => a.lineItemId.localeCompare(b.lineItemId, undefined, { numeric: true }))
}

/**
 * Save one match. The bill line's amount is read from the bill, never taken
 * from the request. Refuses a bill line that already has a saved match.
 */
export async function createSavedBillLineMatch(
  input: CreateManualMatchInput,
  actor: { email: string; name: string | null }
): Promise<SavedBillLineMatch> {
  await assertReady()
  const db = getDb()
  const billRows = rows(
    await db.execute(sql`
      SELECT b.xero_invoice_id, COALESCE(b.status, '') AS status,
        COALESCE(b.raw_json->>'LineAmountTypes', '') AS line_amount_types, b.line_items_json AS line_items
      FROM xero_ap_bills b
      WHERE b.xero_invoice_id = ${input.xeroInvoiceId}
        AND UPPER(COALESCE(b.status, '')) NOT IN ('DELETED', 'VOIDED')
      LIMIT 1
    `)
  )
  const bill = billRows[0]
  if (!bill) throw new ManualMatchError("BILL_NOT_FOUND", "Bill not found (or deleted or voided in Xero).", 404)
  const lineItems = typeof bill.line_items === "string" ? JSON.parse(bill.line_items) : bill.line_items
  const line = billLineForMatch({ lineItems, lineAmountTypes: text(bill.line_amount_types) }, input.xeroLineItemId)
  if (!line) throw new ManualMatchError("BILL_LINE_NOT_FOUND", "That bill line is not on the bill, or has no amount.", 404)

  const planLines = await loadMatchPlanLines(input.mbaNumber)
  if (!planLines.some((p) => p.lineItemId === input.lineItemId)) {
    throw new ManualMatchError(
      "PLAN_LINE_NOT_FOUND",
      `${input.lineItemId} is not a media line on ${input.mbaNumber}'s approved, booked or completed published plan.`,
      422
    )
  }

  const inserted = await db
    .insert(apBillLineMatches)
    .values({
      xeroInvoiceId: input.xeroInvoiceId,
      xeroLineItemId: input.xeroLineItemId,
      lineIndex: line.lineIndex,
      mbaNumber: input.mbaNumber,
      lineItemId: input.lineItemId,
      month: monthToDate(input.month),
      amountCents: line.exGstCents,
      matchedBy: actor.email,
      matchedByName: actor.name,
      note: input.note,
    })
    .onConflictDoNothing({ target: [apBillLineMatches.xeroInvoiceId, apBillLineMatches.xeroLineItemId] })
    .returning({ id: apBillLineMatches.id, matchedAt: apBillLineMatches.matchedAt })
  const row = inserted[0]
  if (!row) {
    throw new ManualMatchError("ALREADY_MATCHED", "This bill line already has a saved match. Remove it first.", 409)
  }
  return {
    id: row.id,
    xeroInvoiceId: input.xeroInvoiceId,
    xeroLineItemId: input.xeroLineItemId,
    mbaNumber: input.mbaNumber,
    lineItemId: input.lineItemId,
    month: input.month,
    amountCents: line.exGstCents,
    matchedBy: actor.email,
    matchedAt: row.matchedAt,
    note: input.note,
  }
}

/** Delete one saved match by id. */
export async function deleteSavedBillLineMatch(id: number): Promise<void> {
  await assertReady()
  const deleted = await getDb()
    .delete(apBillLineMatches)
    .where(eq(apBillLineMatches.id, id))
    .returning({ id: apBillLineMatches.id })
  if (!deleted.length) throw new ManualMatchError("NOT_FOUND", "Saved match not found.", 404)
}
