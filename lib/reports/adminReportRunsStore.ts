/**
 * Admin reads and queue inserts for report_runs.
 * Migration 0095 must be applied before this runs (C-76).
 * The published-version candidate query matches the enqueue cron.
 */
import "server-only"

import { and, asc, eq, isNotNull, sql } from "drizzle-orm"

import { getDb, schema } from "@/db"
import {
  MONTHLY_CAMPAIGN_REPORT_KIND,
  queuedReportRuns,
  selectMonthlyReportMbas,
  type MonthlyReportMbaCandidate,
  type MonthlyReportPeriod,
  type QueuedReportRun,
} from "@/lib/reports/selectMonthlyReportMbas"

export type AdminReportRunRow = {
  id: string
  clientName: string | null
  mbaNumber: string
  status: string
  skipReason: string | null
  error: string | null
  commentaryGenerated: boolean | null
  finishedAt: string | null
  blobPathname: string | null
}

export type AdminReportRunForGenerate = {
  id: string
  mbaNumber: string
  periodStart: string
  periodEnd: string
}

export type EnqueueAdminReportResult = MonthlyReportPeriod & {
  selected: number
  queued: number
  alreadyPresent: number
}

function textOrNull(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).trim()
  return text || null
}

function civilOrMaster(
  versionDate: string | null,
  masterDate: string | null,
): string | null {
  const version = versionDate?.trim()
  if (version) return version
  const master = masterDate?.trim()
  return master || null
}

async function loadPublishedReportCandidates(): Promise<MonthlyReportMbaCandidate[]> {
  const db = getDb()
  const rows = await db
    .select({
      mbaNumber: schema.mediaPlanMasters.mbaNumber,
      clientId: schema.mediaPlanMasters.clientId,
      masterCampaignStatus: schema.mediaPlanMasters.campaignStatus,
      versionCampaignStatus: schema.mediaPlanVersions.campaignStatus,
      versionStart: schema.mediaPlanVersions.campaignStartDate,
      versionEnd: schema.mediaPlanVersions.campaignEndDate,
      masterStart: schema.mediaPlanMasters.campaignStartDate,
      masterEnd: schema.mediaPlanMasters.campaignEndDate,
    })
    .from(schema.mediaPlanMasters)
    .innerJoin(
      schema.mediaPlanVersions,
      and(
        eq(schema.mediaPlanVersions.id, schema.mediaPlanMasters.publishedVersionId),
        isNotNull(schema.mediaPlanVersions.publishedAt),
      ),
    )

  return rows.map((row) => ({
    mbaNumber: row.mbaNumber,
    clientId: row.clientId,
    masterCampaignStatus: row.masterCampaignStatus,
    versionCampaignStatus: row.versionCampaignStatus,
    campaignStart: civilOrMaster(row.versionStart, row.masterStart),
    campaignEnd: civilOrMaster(row.versionEnd, row.masterEnd),
  }))
}

async function insertQueued(rows: QueuedReportRun[]): Promise<number> {
  if (rows.length === 0) return 0
  const db = getDb()
  const inserted = await db
    .insert(schema.reportRuns)
    .values(rows)
    .onConflictDoNothing({
      target: [
        schema.reportRuns.kind,
        schema.reportRuns.mbaNumber,
        schema.reportRuns.periodStart,
      ],
    })
    .returning({ id: schema.reportRuns.id })
  return inserted.length
}

export async function listAdminReportRuns(periodStart: string): Promise<AdminReportRunRow[]> {
  const db = getDb()
  const rows = await db
    .select({
      id: schema.reportRuns.id,
      clientName: schema.mediaPlanMasters.mpClientName,
      mbaNumber: schema.reportRuns.mbaNumber,
      status: schema.reportRuns.status,
      skipReason: schema.reportRuns.skipReason,
      error: schema.reportRuns.error,
      commentaryGenerated: schema.reportRuns.commentaryGenerated,
      finishedAt: schema.reportRuns.finishedAt,
      blobPathname: schema.reportRuns.blobPathname,
    })
    .from(schema.reportRuns)
    .leftJoin(
      schema.mediaPlanMasters,
      eq(schema.mediaPlanMasters.mbaNumber, schema.reportRuns.mbaNumber),
    )
    .where(
      and(
        eq(schema.reportRuns.kind, MONTHLY_CAMPAIGN_REPORT_KIND),
        eq(schema.reportRuns.periodStart, periodStart),
      ),
    )
    .orderBy(asc(schema.mediaPlanMasters.mpClientName), asc(schema.reportRuns.mbaNumber))

  return rows.map((row) => ({
    id: String(row.id),
    clientName: textOrNull(row.clientName),
    mbaNumber: String(row.mbaNumber ?? ""),
    status: String(row.status ?? ""),
    skipReason: textOrNull(row.skipReason),
    error: textOrNull(row.error),
    commentaryGenerated: row.commentaryGenerated,
    finishedAt: textOrNull(row.finishedAt),
    blobPathname: textOrNull(row.blobPathname),
  }))
}

export async function loadReportRunForGenerate(
  id: string,
): Promise<AdminReportRunForGenerate | null> {
  const db = getDb()
  const rows = await db
    .select({
      id: schema.reportRuns.id,
      mbaNumber: schema.reportRuns.mbaNumber,
      periodStart: schema.reportRuns.periodStart,
      periodEnd: schema.reportRuns.periodEnd,
    })
    .from(schema.reportRuns)
    .where(eq(schema.reportRuns.id, id))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return {
    id: String(row.id),
    mbaNumber: String(row.mbaNumber ?? ""),
    periodStart: String(row.periodStart).slice(0, 10),
    periodEnd: String(row.periodEnd).slice(0, 10),
  }
}

/** Marks the row generating without incrementing attempts. */
export async function markReportRunGenerating(id: string): Promise<void> {
  const db = getDb()
  await db
    .update(schema.reportRuns)
    .set({
      status: "generating",
      startedAt: sql`now()`,
      error: null,
      skipReason: null,
    })
    .where(eq(schema.reportRuns.id, id))
}

/**
 * Inserts missing queued rows for the chosen month. Does not generate decks.
 */
export async function enqueueAdminReportRuns(
  period: MonthlyReportPeriod,
): Promise<EnqueueAdminReportResult> {
  const selected = selectMonthlyReportMbas(await loadPublishedReportCandidates(), period)
  const queued = await insertQueued(queuedReportRuns(selected, period))
  return {
    ...period,
    selected: selected.length,
    queued,
    alreadyPresent: Math.max(0, selected.length - queued),
  }
}
