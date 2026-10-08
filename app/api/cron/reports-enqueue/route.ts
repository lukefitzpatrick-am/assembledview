import { NextResponse } from "next/server"
import { and, eq, isNotNull } from "drizzle-orm"

import { getDb, schema } from "@/db"
import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import { getMelbourneTodayISO } from "@/lib/dates/melbourne"
import {
  enqueueMonthlyReportRuns,
  isMonthlyReportEnqueueDay,
  type MonthlyReportMbaCandidate,
  type QueuedReportRun,
} from "@/lib/reports/selectMonthlyReportMbas"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60
export const preferredRegion = ["syd1"]

/**
 * 20:05 UTC on the 3rd is 07:05 AEDT on the 4th (06:05 AEST). 20:05 UTC on the
 * 4th is the 5th in Sydney, the retry. Inserts are idempotent, so the 5th
 * adds nothing that the 4th already queued. `AUTO_REPORTS_ENABLED` must be
 * the string `true`. Do not run until migration 0095 is applied.
 */
export async function GET(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json(
      { error: "unauthorised", hint: "cron_secret_required" },
      { status: 401 },
    )
  }

  if (process.env.AUTO_REPORTS_ENABLED !== "true") {
    return NextResponse.json({ skipped: "disabled" })
  }

  const todayISO = getMelbourneTodayISO()
  const result = await enqueueIfWindow(todayISO)
  if ("skipped" in result) {
    return NextResponse.json(result)
  }
  return NextResponse.json(result)
}

async function enqueueIfWindow(todayISO: string) {
  if (!isMonthlyReportEnqueueDay(todayISO)) {
    return { skipped: "outside_window" as const }
  }
  return enqueueMonthlyReportRuns({
    candidates: await loadMonthlyReportCandidates(),
    todayISO,
    insertQueued,
  })
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

async function loadMonthlyReportCandidates(): Promise<MonthlyReportMbaCandidate[]> {
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
