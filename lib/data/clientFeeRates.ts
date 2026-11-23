import "server-only"

import { and, asc, eq, inArray } from "drizzle-orm"

import { getDb, schema } from "@/db"
import { parseDateOnlyString, toDateOnlyString } from "@/lib/dates/civil"
import { CLIENT_FEE_FIELDS, type ClientFeeField, type ClientFeeRateChange } from "@/lib/finance/clientFeeChannels"

/**
 * client_fee_rates (0120, S4): reads and writes. Callers check the switch
 * client_fee_rate_history first; it can't be on before the marker exists, so
 * nothing here checks the marker.
 */

export type StoredClientFeeRateChange = ClientFeeRateChange & { id: number; clientId: number }

type Row = typeof schema.clientFeeRates.$inferSelect

function toChange(row: Row): StoredClientFeeRateChange {
  return {
    id: row.id,
    clientId: row.clientId,
    field: row.feeField as ClientFeeField,
    ratePct: Number(row.ratePct),
    effectiveFrom: row.effectiveFrom,
  }
}

/** Dated changes per client id, oldest first. All clients when `clientIds` is not given. */
export async function listClientFeeRateChanges(
  clientIds?: readonly number[],
): Promise<Map<number, StoredClientFeeRateChange[]>> {
  const out = new Map<number, StoredClientFeeRateChange[]>()
  if (clientIds && clientIds.length === 0) return out
  const t = schema.clientFeeRates
  const rows = await getDb()
    .select()
    .from(t)
    .where(clientIds ? inArray(t.clientId, [...clientIds]) : undefined)
    .orderBy(asc(t.clientId), asc(t.feeField), asc(t.effectiveFrom))
  for (const row of rows) {
    const list = out.get(row.clientId) ?? []
    list.push(toChange(row))
    out.set(row.clientId, list)
  }
  return out
}

/** Validated input for a new dated change, or the reason it was refused. */
export function parseClientFeeRateChangeInput(
  body: unknown,
): { ok: true; change: ClientFeeRateChange } | { ok: false; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
  const field = b.field
  if (typeof field !== "string" || !(CLIENT_FEE_FIELDS as readonly string[]).includes(field)) {
    return { ok: false, error: "Pick a fee" }
  }
  const ratePct = b.ratePct
  if (typeof ratePct !== "number" || !Number.isFinite(ratePct) || ratePct < 0 || ratePct > 100) {
    return { ok: false, error: "Rate must be a percent from 0 to 100" }
  }
  const effectiveFrom = b.effectiveFrom
  if (typeof effectiveFrom !== "string" || !isCalendarDay(effectiveFrom)) {
    return { ok: false, error: "Effective from must be a date (YYYY-MM-DD)" }
  }
  return { ok: true, change: { field: field as ClientFeeField, ratePct, effectiveFrom } }
}

/** A real calendar day as YYYY-MM-DD (rejects 2026-02-30). */
function isCalendarDay(value: string): boolean {
  // A day that rolls over (30 Feb is 2 Mar) comes back as another string.
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && toDateOnlyString(parseDateOnlyString(value)) === value
}

/** Inserts one change. A second change for the same client, fee and date is a 23505 (the caller answers 409). */
export async function insertClientFeeRateChange(
  clientId: number,
  change: ClientFeeRateChange,
  createdBy: string | null,
): Promise<StoredClientFeeRateChange> {
  const [row] = await getDb()
    .insert(schema.clientFeeRates)
    .values({
      clientId,
      feeField: change.field,
      ratePct: String(change.ratePct),
      effectiveFrom: change.effectiveFrom,
      createdBy,
    })
    .returning()
  return toChange(row)
}

/** Deletes one change of this client. False when the client has no such change. */
export async function deleteClientFeeRateChange(clientId: number, id: number): Promise<boolean> {
  const t = schema.clientFeeRates
  const rows = await getDb()
    .delete(t)
    .where(and(eq(t.id, id), eq(t.clientId, clientId)))
    .returning({ id: t.id })
  return rows.length > 0
}
