/**
 * report_runs writes for on-demand decks. 0097 is applied.
 */
import "server-only"

import { eq, sql } from "drizzle-orm"

import { getDb, schema } from "@/db"
import {
  ON_DEMAND_TIMEOUT_ERROR,
  enqueueOnDemandDeck,
  onDemandInsert,
  type OnDemandDeckRow,
  type OnDemandEnqueueInput,
} from "@/lib/reports/deckJobs/onDemandDeck"
import { rowsOf } from "@/lib/xero/dbRows"

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

function isoTimestamp(value: unknown): string | null {
  if (value == null || value === "") return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString()
  const text = String(value).trim()
  return text || null
}

function mapRow(row: Record<string, unknown>): OnDemandDeckRow {
  return {
    id: String(row.id),
    kind: String(row.kind ?? ""),
    mbaNumber: String(row.mba_number ?? ""),
    periodStart: isoDate(row.period_start),
    periodEnd: isoDate(row.period_end),
    status: String(row.status ?? ""),
    attempts: Number(row.attempts ?? 0),
    blobPathname: row.blob_pathname == null ? null : String(row.blob_pathname),
    fileName: row.file_name == null ? null : String(row.file_name),
    error: row.error == null ? null : String(row.error),
    requestedByEmail: row.requested_by_email == null ? null : String(row.requested_by_email),
    createdAt: isoTimestamp(row.created_at) ?? new Date(0).toISOString(),
    startedAt: isoTimestamp(row.started_at),
  }
}

export async function enqueueOnDemandDeckRow(
  input: OnDemandEnqueueInput,
): Promise<{ runId: string; status: string }> {
  const db = getDb()
  return enqueueOnDemandDeck(
    {
      async insertQueued(row) {
        const inserted = await onDemandInsert(db, row)
        return inserted[0] ?? null
      },
      async findInflight(mbaNumber, periodStart) {
        const result = await db.execute(sql`
          SELECT id, status
          FROM report_runs
          WHERE kind = 'on_demand_deck'
            AND mba_number = ${mbaNumber}
            AND period_start = ${periodStart}
            AND status IN ('queued', 'generating')
          LIMIT 1
        `)
        const found = rowsOf<Record<string, unknown>>(result)[0]
        if (!found) return null
        return { id: String(found.id), status: String(found.status) }
      },
    },
    input,
  )
}

export async function claimQueuedOnDemandDeck(id: string): Promise<OnDemandDeckRow | null> {
  const db = getDb()
  const result = await db.execute(sql`
    UPDATE report_runs
    SET status = 'generating',
        attempts = attempts + 1,
        started_at = now()
    WHERE id::text = ${id}
      AND kind = 'on_demand_deck'
      AND status = 'queued'
    RETURNING *
  `)
  const row = rowsOf<Record<string, unknown>>(result)[0]
  return row ? mapRow(row) : null
}

/** One on_demand_deck row that has been queued for more than 2 minutes. */
export async function claimStaleQueuedOnDemandDeck(): Promise<OnDemandDeckRow | null> {
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
        WHERE kind = 'on_demand_deck'
          AND status = 'queued'
          AND created_at < now() - interval '2 minutes'
        ORDER BY created_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `)
    const row = rowsOf<Record<string, unknown>>(result)[0]
    return row ? mapRow(row) : null
  })
}

/** on_demand_deck rows generating for more than 10 minutes become failed, "Timed out". */
export async function failStuckOnDemandDecks(): Promise<number> {
  const db = getDb()
  const result = await db.execute(sql`
    UPDATE report_runs
    SET status = 'failed',
        error = ${ON_DEMAND_TIMEOUT_ERROR},
        finished_at = now()
    WHERE kind = 'on_demand_deck'
      AND status = 'generating'
      AND started_at < now() - interval '10 minutes'
    RETURNING id
  `)
  return rowsOf(result).length
}

export async function markOnDemandDeckGenerated(
  id: string,
  fields: { blobPathname: string; fileName: string; error: string | null },
): Promise<void> {
  const db = getDb()
  await db
    .update(schema.reportRuns)
    .set({
      status: "generated",
      blobPathname: fields.blobPathname,
      fileName: fields.fileName,
      error: fields.error,
      finishedAt: sql`now()`,
    })
    .where(eq(schema.reportRuns.id, id))
}

export async function markOnDemandDeckFailed(id: string, message: string): Promise<void> {
  const db = getDb()
  await db
    .update(schema.reportRuns)
    .set({
      status: "failed",
      error: message.slice(0, 2000),
      finishedAt: sql`now()`,
    })
    .where(eq(schema.reportRuns.id, id))
}

export async function findOnDemandDeck(id: string): Promise<OnDemandDeckRow | null> {
  const db = getDb()
  const result = await db.execute(sql`
    SELECT *
    FROM report_runs
    WHERE id::text = ${id}
      AND kind = 'on_demand_deck'
    LIMIT 1
  `)
  const row = rowsOf<Record<string, unknown>>(result)[0]
  return row ? mapRow(row) : null
}
