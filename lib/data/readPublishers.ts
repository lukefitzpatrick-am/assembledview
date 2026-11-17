import "server-only"

import { asc } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { coerceNumericStringsToNumbers, toApiRow } from "@/lib/data/toApiRow"

export function mapPublisherRowFromPostgres(
  row: Record<string, unknown>
): Record<string, unknown> {
  const api = toApiRow(row)
  return coerceNumericStringsToNumbers(api)
}

/**
 * Every publisher, lowest `publishers.id` first. The order is load-bearing:
 * name and publisherid lookups over this list (AA matching, the publisher hub)
 * resolve a duplicate to the lowest id, never to whatever order Postgres
 * happened to return. Publisher names and ids are unique (INVARIANTS).
 */
export async function fetchPublishersFromPostgres(): Promise<Record<string, unknown>[]> {
  const db = getDb()
  const rows = await db.select().from(schema.publishers).orderBy(asc(schema.publishers.id))
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
