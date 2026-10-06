import "server-only"

import { eq } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { coerceNumericStringsToNumbers, toApiRow } from "@/lib/data/toApiRow"

const ABN_AS_TEXT = new Set(["abn"])

export function mapClientRowFromPostgres(
  row: Record<string, unknown>
): Record<string, unknown> {
  const api = toApiRow(row)
  return coerceNumericStringsToNumbers(api, { keepAsText: ABN_AS_TEXT })
}

export async function fetchClientsFromPostgres(): Promise<Record<string, unknown>[]> {
  const db = getDb()
  const rows = await db.select().from(schema.clients)
  return rows.map((row) => mapClientRowFromPostgres(row as Record<string, unknown>))
}

/** Clients list. Postgres. Callers apply slug / omitClientBrain. */
export async function readClientsList(): Promise<{
  status: number
  body: unknown
  contentType: string
}> {
  const rows = await fetchClientsFromPostgres()
  return { status: 200, body: rows, contentType: "application/json" }
}

/**
 * Single client by id. Postgres.
 * Includes `client_brain` (text) when present — required for AVA brain tools.
 */
export async function readClientById(id: string | number): Promise<{
  status: number
  body: unknown
  contentType: string
}> {
  const rawId = String(id ?? "").trim()
  if (!rawId) {
    return { status: 404, body: { error: "not found" }, contentType: "application/json" }
  }

  const numericId = Number(rawId)
  if (!Number.isFinite(numericId)) {
    return { status: 404, body: { error: "not found" }, contentType: "application/json" }
  }
  const db = getDb()
  const rows = await db
    .select()
    .from(schema.clients)
    .where(eq(schema.clients.id, numericId))
    .limit(1)
  const row = rows[0]
  if (!row) {
    return { status: 404, body: { error: "not found" }, contentType: "application/json" }
  }
  return {
    status: 200,
    body: mapClientRowFromPostgres(row as Record<string, unknown>),
    contentType: "application/json",
  }
}
