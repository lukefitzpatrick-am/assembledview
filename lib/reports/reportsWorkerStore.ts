/**
 * report_runs claims for the hourly worker. Migration 0095 must be applied
 * before this runs. Do not call it against live Postgres until then (C-76).
 */
import "server-only"

import { eq, sql } from "drizzle-orm"

import { getDb, schema } from "@/db"
import { rowsOf } from "@/lib/xero/dbRows"
import {
  REPORTS_WORKER_TIMEOUT_ERROR,
  type ClaimedReportRun,
  type ReportWorkerGeneratedFields,
} from "@/lib/reports/runReportsWorker"

function isoDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  const text = String(value ?? "").trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error("Report run is missing a period date")
  }
  return text
}

/**
 * Rows stuck in generating for more than 30 minutes.
 * Under three attempts they return to queued. At three they fail.
 */
export async function resetStuckReportRuns(): Promise<void> {
  const db = getDb()
  await db.execute(sql`
    UPDATE report_runs
    SET
      status = CASE WHEN attempts < 3 THEN 'queued' ELSE 'failed' END,
      error = CASE WHEN attempts < 3 THEN NULL ELSE ${REPORTS_WORKER_TIMEOUT_ERROR} END,
      finished_at = CASE WHEN attempts < 3 THEN NULL ELSE now() END
    WHERE status = 'generating'
      AND started_at < now() - interval '30 minutes'
  `)
}

/**
 * Claim one queued or failed row with attempts still under 3.
 * The update and the skip-locked read commit together.
 */
export async function claimNextReportRun(): Promise<ClaimedReportRun | null> {
  const db = getDb()
  return db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      UPDATE report_runs
      SET status = 'generating',
          attempts = attempts + 1,
          started_at = now()
      WHERE id = (
        SELECT id
        FROM report_runs
        WHERE (status = 'queued' OR status = 'failed')
          AND attempts < 3
        ORDER BY created_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `)
    const row = rowsOf<Record<string, unknown>>(result)[0]
    if (!row) return null
    return {
      id: String(row.id),
      mbaNumber: String(row.mba_number ?? ""),
      periodStart: isoDate(row.period_start),
      periodEnd: isoDate(row.period_end),
      attempts: Number(row.attempts),
    }
  })
}

export async function saveGeneratedReportRun(
  id: string,
  fields: ReportWorkerGeneratedFields,
): Promise<void> {
  const db = getDb()
  await db
    .update(schema.reportRuns)
    .set({
      status: "generated",
      blobPathname: fields.blobPathname,
      fileName: fields.fileName,
      commentaryGenerated: fields.commentaryGenerated,
      finishedAt: sql`now()`,
      error: null,
      skipReason: null,
    })
    .where(eq(schema.reportRuns.id, id))
}

export async function saveSkippedReportRun(id: string, skipReason: string): Promise<void> {
  const db = getDb()
  await db
    .update(schema.reportRuns)
    .set({
      status: "skipped",
      skipReason,
      commentaryGenerated: false,
      finishedAt: sql`now()`,
      error: null,
    })
    .where(eq(schema.reportRuns.id, id))
}

export async function saveFailedReportRun(id: string, error: string): Promise<void> {
  const db = getDb()
  await db
    .update(schema.reportRuns)
    .set({
      status: "failed",
      error,
      finishedAt: sql`now()`,
    })
    .where(eq(schema.reportRuns.id, id))
}
