/**
 * One Xero cron stage: write a running xero_sync_log row first, run the
 * stage, then update that row. A platform kill leaves status=running, which
 * resume ignores, so the previous success watermark stays put.
 * new_watermark moves only when the stage returns success.
 */

import { sql } from "drizzle-orm"

import { db } from "@/db"

import { rowsOf } from "./dbRows"
import { startStageBudget, type StageBudget } from "./stageBudget"
import {
  sqlStageWatermarkWhere,
  type XeroCronStageName,
} from "./syncLogNotes"

export type XeroCronStatus = "success" | "incomplete" | "failed"

export type StageRunResult = {
  outcome: XeroCronStatus
  /** Used only when outcome is success. */
  newWatermark: string | null
  invoicesUpserted: number
  contactsUpserted: number
  notes: Record<string, unknown>
}

export type XeroCronStageResult = {
  stage: XeroCronStageName
  status: XeroCronStatus
  duration_ms: number
  log_id: number | null
  invoices_upserted: number
  contacts_upserted: number
  notes: Record<string, unknown>
}

export const XERO_STAGE_BUDGET_MS: Record<XeroCronStageName, number> = {
  invoices: 240_000,
  import: 240_000,
  contacts: 240_000,
  pdfs: 40_000,
}

type WatermarkRow = {
  notes: string | null
  watermark_used: string | null
  new_watermark: string | null
}

export async function fetchCronWatermarkRow(
  stage: "invoices" | "contacts",
): Promise<WatermarkRow | null> {
  const rows = rowsOf<WatermarkRow>(
    await db.execute(sql`
      SELECT notes, watermark_used, new_watermark
      FROM xero_sync_log
      WHERE ${sqlStageWatermarkWhere(stage)}
      ORDER BY id DESC
      LIMIT 1
    `),
  )
  return rows[0] ?? null
}

async function beginXeroSyncLog(args: {
  stage: XeroCronStageName
  watermarkUsed: string | null
}): Promise<number> {
  const rows = rowsOf<{ id: number | string }>(
    await db.execute(sql`
      INSERT INTO xero_sync_log (
        run_started_at, status, watermark_used, new_watermark,
        stage, invoices_upserted, contacts_upserted, notes
      ) VALUES (
        now(),
        'running',
        ${args.watermarkUsed}::timestamptz,
        ${args.watermarkUsed}::timestamptz,
        ${args.stage},
        0,
        0,
        ${JSON.stringify({ stage: args.stage, status: "running" })}
      )
      RETURNING id
    `),
  )
  const id = Number(rows[0]?.id)
  if (!Number.isFinite(id)) {
    throw new Error("xero_sync_log running insert did not return an id")
  }
  return id
}

async function finishXeroSyncLog(args: {
  id: number
  status: XeroCronStatus
  watermarkUsed: string | null
  newWatermark: string | null
  invoicesUpserted: number
  contactsUpserted: number
  notes: Record<string, unknown>
  durationMs: number
}): Promise<void> {
  const carried =
    args.status === "success" ? args.newWatermark : args.watermarkUsed
  await db.execute(sql`
    UPDATE xero_sync_log SET
      run_finished_at = now(),
      status = ${args.status},
      new_watermark = ${carried}::timestamptz,
      invoices_upserted = ${args.invoicesUpserted},
      contacts_upserted = ${args.contactsUpserted},
      duration_ms = ${args.durationMs},
      notes = ${JSON.stringify({ ...args.notes, status: args.status })}
    WHERE id = ${args.id}
  `)
}

export async function runLoggedXeroStage(args: {
  stage: XeroCronStageName
  watermarkUsed: string | null
  budgetMs?: number
  now?: () => number
  run: (ctx: { budget: StageBudget }) => Promise<StageRunResult>
}): Promise<XeroCronStageResult> {
  const started = (args.now ?? Date.now)()
  const budget = startStageBudget(
    args.budgetMs ?? XERO_STAGE_BUDGET_MS[args.stage],
    args.now ?? Date.now,
  )
  const logId = await beginXeroSyncLog({
    stage: args.stage,
    watermarkUsed: args.watermarkUsed,
  })

  let outcome: StageRunResult
  try {
    outcome = await args.run({ budget })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    outcome = {
      outcome: "failed",
      newWatermark: null,
      invoicesUpserted: 0,
      contactsUpserted: 0,
      notes: { error: message },
    }
  }

  const duration_ms = (args.now ?? Date.now)() - started
  try {
    await finishXeroSyncLog({
      id: logId,
      status: outcome.outcome,
      watermarkUsed: args.watermarkUsed,
      newWatermark: outcome.newWatermark,
      invoicesUpserted: outcome.invoicesUpserted,
      contactsUpserted: outcome.contactsUpserted,
      notes: outcome.notes,
      durationMs: duration_ms,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      stage: args.stage,
      status: "failed",
      duration_ms,
      log_id: logId,
      invoices_upserted: outcome.invoicesUpserted,
      contacts_upserted: outcome.contactsUpserted,
      notes: { ...outcome.notes, log_update_error: message },
    }
  }

  return {
    stage: args.stage,
    status: outcome.outcome,
    duration_ms,
    log_id: logId,
    invoices_upserted: outcome.invoicesUpserted,
    contacts_upserted: outcome.contactsUpserted,
    notes: outcome.notes,
  }
}
