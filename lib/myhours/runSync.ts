/**
 * Postgres-backed MyHours sync (cron entrypoint).
 */
import "server-only"

import { desc, inArray, sql } from "drizzle-orm"

import { getDb, schema } from "@/db"
import { getClientDisplayName } from "@/lib/clients/slug"
import { MyHoursAuthError } from "@/lib/myhours/client"
import {
  clientProjectName,
  runMyHoursSync,
  type AvCampaign,
  type AvClientAnchor,
  type ExistingEntry,
  type ExistingLink,
  type StructureLink,
  type TimeEntryUpsert,
} from "@/lib/myhours/sync"
import { sydneyTodayYmd } from "@/lib/myhours/sydneyWeek"

export async function runMyHoursSyncToPostgres(): Promise<{
  status: "ok" | "error"
  entriesUpserted: number
  structuresCreated: number
  unmappedCount: number
  unknownUserCount: number
  dateFrom: string
  dateTo: string
  error?: string
}> {
  const database = getDb()
  const apiKey = process.env.MYHOURS_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("MYHOURS_API_KEY is not set")
  }

  return runMyHoursSync({
    getApiKey: () => apiKey,
    todayYmd: () => sydneyTodayYmd(),
    loadCursorDateFrom: async () => {
      const [ok] = await database
        .select({ finishedAt: schema.myhoursSyncRuns.finishedAt })
        .from(schema.myhoursSyncRuns)
        .where(sql`${schema.myhoursSyncRuns.error} IS NULL`)
        .orderBy(desc(schema.myhoursSyncRuns.id))
        .limit(1)
      return ok?.finishedAt ? ok.finishedAt.slice(0, 10) : null
    },
    listClientAnchors: async (): Promise<AvClientAnchor[]> => {
      const rows = await database
        .select({
          id: schema.clients.id,
          mpClientName: schema.clients.mpClientName,
          mbaidentifier: schema.clients.mbaidentifier,
          m365IsAnchor: schema.clients.m365IsAnchor,
        })
        .from(schema.clients)

      // Prefer m365_is_anchor rows; if none flagged for a group, keep all
      // non-empty named clients that are anchors OR have unique ids.
      const anchors = rows.filter((r) => r.m365IsAnchor === true)
      const source = anchors.length > 0 ? anchors : rows
      return source.map((r) => ({
        clientId: r.id,
        projectName: clientProjectName(r.id, getClientDisplayName(r)),
      }))
    },
    listActiveCampaigns: async (): Promise<AvCampaign[]> => {
      const rows = await database
        .select({
          mbaNumber: schema.mediaPlanMasters.mbaNumber,
          campaignName: schema.mediaPlanMasters.campaignName,
          clientId: schema.mediaPlanMasters.clientId,
          campaignStatus: schema.mediaPlanMasters.campaignStatus,
        })
        .from(schema.mediaPlanMasters)
      return rows.map((r) => ({
        mbaNumber: r.mbaNumber,
        campaignName: r.campaignName ?? "",
        clientId: r.clientId,
        campaignStatus: r.campaignStatus,
      }))
    },
    listLinks: async (): Promise<ExistingLink[]> => {
      const rows = await database.select().from(schema.myhoursLinks)
      return rows.map((r) => ({
        kind: r.kind as ExistingLink["kind"],
        clientId: r.clientId,
        mbaNumber: r.mbaNumber,
        myhoursId: r.myhoursId,
        myhoursName: r.myhoursName,
      }))
    },
    saveLink: async (link: StructureLink) => {
      await database.insert(schema.myhoursLinks).values({
        kind: link.kind,
        clientId: link.clientId,
        mbaNumber: link.mbaNumber,
        myhoursId: link.myhoursId,
        myhoursName: link.myhoursName,
        createdBy: "myhours-sync",
      })
    },
    listExistingEntriesByLogIds: async (
      logIds: string[]
    ): Promise<ExistingEntry[]> => {
      if (logIds.length === 0) return []
      const rows = await database
        .select({
          myhoursLogId: schema.timeEntries.myhoursLogId,
          mappingSource: schema.timeEntries.mappingSource,
          clientId: schema.timeEntries.clientId,
          mbaNumber: schema.timeEntries.mbaNumber,
        })
        .from(schema.timeEntries)
        .where(inArray(schema.timeEntries.myhoursLogId, logIds))
      return rows.map((r) => ({
        myhoursLogId: r.myhoursLogId,
        mappingSource: r.mappingSource as ExistingEntry["mappingSource"],
        clientId: r.clientId,
        mbaNumber: r.mbaNumber,
      }))
    },
    upsertEntries: async (rows: TimeEntryUpsert[]) => {
      if (rows.length === 0) return 0
      const now = new Date().toISOString()
      let n = 0
      // Batch in chunks to stay under parameter limits
      const CHUNK = 100
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK)
        await database
          .insert(schema.timeEntries)
          .values(
            slice.map((r) => ({
              myhoursLogId: r.myhoursLogId,
              memberEmail: r.memberEmail,
              entryDate: r.entryDate,
              durationMinutes: r.durationMinutes,
              note: r.note,
              myhoursProjectId: r.myhoursProjectId,
              myhoursProjectName: r.myhoursProjectName,
              myhoursTaskId: r.myhoursTaskId,
              myhoursTaskName: r.myhoursTaskName,
              clientId: r.clientId,
              mbaNumber: r.mbaNumber,
              mappingSource: r.mappingSource,
              raw: r.raw,
              syncedAt: now,
            }))
          )
          .onConflictDoUpdate({
            target: schema.timeEntries.myhoursLogId,
            set: {
              memberEmail: sql`excluded.member_email`,
              entryDate: sql`excluded.entry_date`,
              durationMinutes: sql`excluded.duration_minutes`,
              note: sql`excluded.note`,
              myhoursProjectId: sql`excluded.myhours_project_id`,
              myhoursProjectName: sql`excluded.myhours_project_name`,
              myhoursTaskId: sql`excluded.myhours_task_id`,
              myhoursTaskName: sql`excluded.myhours_task_name`,
              // Preserve manual mapping fields
              clientId: sql`CASE WHEN ${schema.timeEntries.mappingSource} = 'manual' THEN ${schema.timeEntries.clientId} ELSE excluded.client_id END`,
              mbaNumber: sql`CASE WHEN ${schema.timeEntries.mappingSource} = 'manual' THEN ${schema.timeEntries.mbaNumber} ELSE excluded.mba_number END`,
              mappingSource: sql`CASE WHEN ${schema.timeEntries.mappingSource} = 'manual' THEN ${schema.timeEntries.mappingSource} ELSE excluded.mapping_source END`,
              raw: sql`excluded.raw`,
              syncedAt: sql`excluded.synced_at`,
            },
          })
        n += slice.length
      }
      return n
    },
    saveRun: async (row) => {
      await database.insert(schema.myhoursSyncRuns).values({
        startedAt: row.startedAt,
        finishedAt: row.finishedAt,
        entriesUpserted: row.entriesUpserted,
        structuresCreated: row.structuresCreated,
        unmappedCount: row.unmappedCount,
        unknownUserCount: row.unknownUserCount,
        error: row.error,
      })
    },
  })
}

export { MyHoursAuthError }
