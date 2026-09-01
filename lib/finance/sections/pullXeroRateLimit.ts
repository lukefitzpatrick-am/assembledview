/**
 * Per-user 1/min gate for POST /api/finance/sections/pull-xero.
 * Source of truth is the newest pull-xero `xero_sync_log` row for this user
 * (`notes.pulled_by`, CASE-guarded jsonb extract — never unguarded notes::jsonb).
 */

import { sql } from "drizzle-orm"

import { getDb } from "@/db"
import { rowsOf } from "@/lib/xero/dbRows"
import {
  SQL_SYNC_LOG_NOTES_PULLED_BY_EXPR,
  sqlPullXeroLogWhere,
} from "@/lib/xero/syncLogNotes"

export const PULL_XERO_WINDOW_MS = 60_000

export type PullXeroRateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number }

export function pullXeroRetryAfterSeconds(
  lastAtMs: number | null | undefined,
  now = Date.now()
): number | null {
  if (lastAtMs == null || !Number.isFinite(lastAtMs)) return null
  const elapsed = now - lastAtMs
  if (elapsed < PULL_XERO_WINDOW_MS) {
    return Math.max(1, Math.ceil((PULL_XERO_WINDOW_MS - elapsed) / 1000))
  }
  return null
}

export async function checkPullXeroRateLimit(
  userKey: string,
  now = Date.now()
): Promise<PullXeroRateLimitResult> {
  const key = userKey.trim()
  if (!key) return { ok: true }
  const db = getDb()
  const row = rowsOf<{ run_finished_at: string | null }>(
    await db.execute(sql`
      SELECT run_finished_at::text AS run_finished_at
      FROM xero_sync_log
      WHERE ${sqlPullXeroLogWhere}
        AND ${sql.raw(SQL_SYNC_LOG_NOTES_PULLED_BY_EXPR)} = ${key}
      ORDER BY id DESC
      LIMIT 1
    `)
  )[0]
  const lastMs = row?.run_finished_at ? Date.parse(String(row.run_finished_at)) : Number.NaN
  const retryAfterSeconds = pullXeroRetryAfterSeconds(
    Number.isFinite(lastMs) ? lastMs : null,
    now
  )
  if (retryAfterSeconds != null) {
    return { ok: false, retryAfterSeconds }
  }
  return { ok: true }
}
