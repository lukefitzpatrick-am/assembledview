/**
 * xero_sync_log.notes is text. CB-5 tags pull rows as JSON `{ source: "pull-xero" }`
 * so cron resume can skip them. Legacy rows are prose ("Sync completed successfully")
 * — casting every notes value to jsonb raises 22P02 before ORDER BY / LIMIT 1.
 *
 * Postgres AND is not guaranteed to short-circuit, so the live SQL uses CASE:
 * the jsonb cast is only in the THEN branch, after notes looks like JSON.
 * Prose is treated as not-a-pull (pre-CB-5: eligible as a cron watermark).
 */

import { sql } from "drizzle-orm"

/** Same shape test as the SQL CASE WHEN. */
export const SYNC_LOG_JSON_SHAPE_RE = /^\s*[{\[]/

/**
 * Postgres expression that returns notes.source or NULL without casting prose.
 * Embed with sql.raw — do not concatenate into a user-controlled string.
 */
export const SQL_SYNC_LOG_NOTES_SOURCE_EXPR =
  "CASE WHEN notes ~ '^\\s*[{\\[]' THEN notes::jsonb->>'source' ELSE NULL END"

export const SQL_SYNC_LOG_NOTES_PULLED_BY_EXPR =
  "CASE WHEN notes ~ '^\\s*[{\\[]' THEN notes::jsonb->>'pulled_by' ELSE NULL END"

export const sqlCronWatermarkLogWhere = sql.raw(
  `COALESCE(${SQL_SYNC_LOG_NOTES_SOURCE_EXPR}, '') IS DISTINCT FROM 'pull-xero'`,
)

export const sqlPullXeroLogWhere = sql.raw(
  `${SQL_SYNC_LOG_NOTES_SOURCE_EXPR} = 'pull-xero'`,
)

export function syncLogNotesLooksLikeJson(
  notes: string | null | undefined,
): boolean {
  return typeof notes === "string" && SYNC_LOG_JSON_SHAPE_RE.test(notes)
}

/** TS try/catch: prose / invalid JSON / missing source → null. Never throws.
 *  NOT equivalent to the SQL CASE for invalid JSON that begins with `{` or `[`:
 *  the CASE enters THEN and `notes::jsonb` raises 22P02. 0056 (source column)
 *  is the durable fix — do not treat this CASE as a complete guard. */
export function syncLogNotesSource(
  notes: string | null | undefined,
): string | null {
  if (!syncLogNotesLooksLikeJson(notes)) return null
  try {
    const v = JSON.parse(notes as string) as unknown
    if (!v || typeof v !== "object" || Array.isArray(v)) return null
    const source = (v as Record<string, unknown>).source
    return typeof source === "string" ? source : null
  } catch {
    return null
  }
}

export function isCronWatermarkEligibleNotes(
  notes: string | null | undefined,
): boolean {
  return (syncLogNotesSource(notes) ?? "") !== "pull-xero"
}

export type SyncLogWatermarkRow = {
  id: number
  notes: string | null
  watermark_used: string | null
  new_watermark: string | null
}

export function pickLatestCronWatermarkLog(
  rows: SyncLogWatermarkRow[],
): SyncLogWatermarkRow | null {
  return (
    rows
      .toSorted((a, b) => b.id - a.id)
      .find((r) => isCronWatermarkEligibleNotes(r.notes)) ?? null
  )
}
