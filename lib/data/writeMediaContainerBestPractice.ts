/**
 * Postgres-authoritative media_container_best_practice writes (X4).
 * Order: PG insert/update → invalidate cache → best-effort Xano mirror.
 */
import "server-only"

import { eq, sql } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { xanoPostHeaderRecord, xanoUrl } from "@/lib/api/xano"
import { invalidateMediaContainerBestPracticeCache } from "@/lib/api/mediaContainerBestPracticeCache"
import { toApiRow } from "@/lib/data/toApiRow"

export const BP_MIRROR_FAILURE_KIND = "xano_media_container_bp_mirror_failed"
export const BP_MIRROR_FAILURE_AUDIENCE = "admin"

export type BpMirrorFailurePayload = {
  op: "create" | "update"
  id: number
  error: string
  timestamp: string
  retried: boolean
}

export function buildBpMirrorFailurePayload(input: {
  op: "create" | "update"
  id: number
  error: string
  at?: Date
}): BpMirrorFailurePayload {
  return {
    op: input.op,
    id: input.id,
    error: input.error,
    timestamp: (input.at ?? new Date()).toISOString(),
    retried: false,
  }
}

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

async function persistBpMirrorFailureNotification(
  payload: BpMirrorFailurePayload
): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) return
  try {
    const db = getDb()
    await db.execute(sql`
      INSERT INTO app_notifications (audience, kind, payload)
      VALUES (
        ${BP_MIRROR_FAILURE_AUDIENCE},
        ${BP_MIRROR_FAILURE_KIND},
        ${JSON.stringify(payload)}::jsonb
      )
    `)
  } catch (err) {
    console.warn("[bp-mirror] failed to persist app_notifications row", {
      id: payload.id,
      err,
    })
  }
}

export type BpMirrorResult = "ok" | "failed"

async function mirrorBpToXano(input: {
  op: "create" | "update"
  id: number
  snakeRow: Record<string, unknown>
}): Promise<BpMirrorResult> {
  const timeoutMs = Number(process.env.XANO_TIMEOUT_MS ?? 8000)
  const headers = {
    "Content-Type": "application/json",
    ...xanoPostHeaderRecord(),
  }
  const payload = { ...input.snakeRow, id: input.id }
  const base = xanoUrl("media_container_best_practice", "XANO_PUBLISHERS_BASE_URL")

  try {
    if (input.op === "create") {
      const res = await fetch(base, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) {
        throw new Error(
          `Xano POST media_container_best_practice ${res.status}: ${await res.text().catch(() => "")}`
        )
      }
    } else {
      const res = await fetch(`${base}/${encodeURIComponent(String(input.id))}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) {
        throw new Error(
          `Xano PUT media_container_best_practice/${input.id} ${res.status}: ${await res.text().catch(() => "")}`
        )
      }
    }
    return "ok"
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[bp-mirror] Xano mirror failed", {
      op: input.op,
      id: input.id,
      message,
    })
    await persistBpMirrorFailureNotification(
      buildBpMirrorFailurePayload({
        op: input.op,
        id: input.id,
        error: message,
      })
    )
    return "failed"
  }
}

export type BpWriteResult = {
  row: Record<string, unknown>
  mirror: BpMirrorResult
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
  const mirror = await mirrorBpToXano({
    op: "create",
    id: Number(inserted.id),
    snakeRow: snake,
  })
  return { row, mirror }
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
    return { row: mapBpRow(existing as Record<string, unknown>), mirror: "ok" }
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
  const mirror = await mirrorBpToXano({
    op: "update",
    id: numericId,
    snakeRow: snake,
  })
  return { row, mirror }
}

/** Dual-read helper for the TTL cache when publishers backend is postgres. */
export async function fetchMediaContainerBestPracticeFromPostgres(): Promise<
  Record<string, unknown>[]
> {
  const db = getDb()
  const rows = await db.select().from(schema.mediaContainerBestPractice)
  return rows.map((row) => mapBpRow(row as Record<string, unknown>))
}
