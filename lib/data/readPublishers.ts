import "server-only"

import { eq } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { coerceNumericStringsToNumbers, toApiRow } from "@/lib/data/toApiRow"

export function mapPublisherRowFromPostgres(
  row: Record<string, unknown>
): Record<string, unknown> {
  const api = toApiRow(row)
  return coerceNumericStringsToNumbers(api)
}

export async function fetchPublishersFromPostgres(): Promise<Record<string, unknown>[]> {
  const db = getDb()
  const rows = await db.select().from(schema.publishers)
  return rows.map((row) => mapPublisherRowFromPostgres(row as Record<string, unknown>))
}

/** Publishers list. Postgres. */
export async function readPublishersList(): Promise<{
  status: number
  body: unknown
  contentType: string
}> {
  const rows = await fetchPublishersFromPostgres()
  return { status: 200, body: rows, contentType: "application/json" }
}

export async function readPublisherById(id: string | number): Promise<{
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
    .from(schema.publishers)
    .where(eq(schema.publishers.id, numericId))
    .limit(1)
  const row = rows[0]
  if (!row) {
    return { status: 404, body: { error: "not found" }, contentType: "application/json" }
  }
  return {
    status: 200,
    body: mapPublisherRowFromPostgres(row as Record<string, unknown>),
    contentType: "application/json",
  }
}
