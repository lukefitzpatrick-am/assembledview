/**
 * Postgres-authoritative media_container_best_practice writes.
 * The Postgres insert or update is the whole function.
 */
import "server-only"

import { eq, sql } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { invalidateMediaContainerBestPracticeCache } from "@/lib/api/mediaContainerBestPracticeCache"
import { toApiRow } from "@/lib/data/toApiRow"

export function normalizeBpWritePayload(
  body: Record<string, unknown>,
  options: { requireMediaContainer?: boolean } = {}
): Record<string, unknown> {
  const requireMediaContainer = options.requireMediaContainer !== false
  const out: Record<string, unknown> = {}
  if (body.media_container != null && String(body.media_container).trim() !== "") {
    out.media_container = String(body.media_container).trim()
  }
  if (body.best_practice !== undefined) {
    out.best_practice = body.best_practice
  }
  if (body.is_active !== undefined) {
    out.is_active = Boolean(body.is_active)
  }
  if (body._name != null && String(body._name).trim() !== "") {
    out._name = String(body._name).trim()
  }
  if (requireMediaContainer && !out.media_container) {
    throw new Error("Missing required fields: media_container")
  }
  return out
}

function snakeToInsertValues(
  snake: Record<string, unknown>
): typeof schema.mediaContainerBestPractice.$inferInsert {
  const values: Record<string, unknown> = {}
  if ("media_container" in snake) values.mediaContainer = snake.media_container
  if ("best_practice" in snake) values.bestPractice = snake.best_practice
  if ("is_active" in snake) values.isActive = snake.is_active
  if ("_name" in snake) values.Name = snake._name
  return values as typeof schema.mediaContainerBestPractice.$inferInsert
}

function mapBpRow(row: Record<string, unknown>): Record<string, unknown> {
  const api = toApiRow(row)
  // Drizzle column `Name` → toApiRow yields `_name` only if key was `Name` → `_name`?
  // toApiRow: Name → _name (N → _n… wait: Name.replace(/[A-Z]/g) → `_name` for N and nothing for ame?
  // "Name".replace(/[A-Z]/g, c => `_${c.toLowerCase()}`) → "_name" — good.
  return api
}

export async function syncBpIdSequence(): Promise<void> {
  const db = getDb()
  await db.execute(sql`
    SELECT setval(
      pg_get_serial_sequence('media_container_best_practice', 'id'),
      COALESCE((SELECT MAX(id) FROM media_container_best_practice), 1),
      true
    )
  `)
}

export type BpWriteResult = {
  row: Record<string, unknown>
}

export async function createMediaContainerBestPracticePostgresFirst(
  body: Record<string, unknown>
): Promise<BpWriteResult> {
  const snake = normalizeBpWritePayload(body, { requireMediaContainer: true })
  await syncBpIdSequence()
  const db = getDb()
  const [inserted] = await db
    .insert(schema.mediaContainerBestPractice)
    .values(snakeToInsertValues(snake))
    .returning()
  if (!inserted?.id) {
    throw new Error("Postgres media_container_best_practice insert returned no id")
  }
  invalidateMediaContainerBestPracticeCache()
  const row = mapBpRow(inserted as Record<string, unknown>)
  return { row }
}

export async function updateMediaContainerBestPracticePostgresFirst(
  id: string | number,
  body: Record<string, unknown>
): Promise<BpWriteResult | { notFound: true }> {
  const numericId = Number(id)
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return { notFound: true }
  }
  const snake = normalizeBpWritePayload(body, { requireMediaContainer: false })
  if (Object.keys(snake).length === 0) {
    const [existing] = await getDb()
      .select()
      .from(schema.mediaContainerBestPractice)
      .where(eq(schema.mediaContainerBestPractice.id, numericId))
      .limit(1)
    if (!existing) return { notFound: true }
    return { row: mapBpRow(existing as Record<string, unknown>) }
  }

  const values = {
    ...snakeToInsertValues(snake),
    updatedAt: new Date().toISOString(),
  }
  const db = getDb()
  const [updated] = await db
    .update(schema.mediaContainerBestPractice)
    .set(values)
    .where(eq(schema.mediaContainerBestPractice.id, numericId))
    .returning()
  if (!updated) return { notFound: true }

  invalidateMediaContainerBestPracticeCache()
  const row = mapBpRow(updated as Record<string, unknown>)
  return { row }
}

/** Dual-read helper for the TTL cache when publishers backend is postgres. */
export async function fetchMediaContainerBestPracticeFromPostgres(): Promise<
  Record<string, unknown>[]
> {
  const db = getDb()
  const rows = await db.select().from(schema.mediaContainerBestPractice)
  return rows.map((row) => mapBpRow(row as Record<string, unknown>))
}
