import { NextRequest, NextResponse } from "next/server"
import { and, desc, eq, sql } from "drizzle-orm"

import { getDb, schema } from "@/db"
import { requireAdmin } from "@/lib/requireRole"
import { sydneyWeekRange } from "@/lib/myhours/sydneyWeek"

export const runtime = "nodejs"

/**
 * GET /api/admin/myhours-mapping
 * Unmapped time entries grouped by MyHours project/task (current Sydney week).
 * Includes last sync run's unknown_user_count sentinel (CX2-1).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth && auth.response) return auth.response

  try {
    const url = new URL(request.url)
    const all = url.searchParams.get("all") === "1"
    const { startYmd, endYmd } = sydneyWeekRange()
    const database = getDb()

    const conds = [eq(schema.timeEntries.mappingSource, "unmapped")]
    if (!all) {
      conds.push(
        sql`${schema.timeEntries.entryDate} >= ${startYmd}`,
        sql`${schema.timeEntries.entryDate} <= ${endYmd}`
      )
    }

    const [rows, [lastRun]] = await Promise.all([
      database
        .select({
          myhoursProjectId: schema.timeEntries.myhoursProjectId,
          myhoursProjectName: schema.timeEntries.myhoursProjectName,
          myhoursTaskId: schema.timeEntries.myhoursTaskId,
          myhoursTaskName: schema.timeEntries.myhoursTaskName,
          entryCount: sql<number>`count(*)::int`,
          minutes: sql<number>`coalesce(sum(${schema.timeEntries.durationMinutes}), 0)::int`,
        })
        .from(schema.timeEntries)
        .where(and(...conds))
        .groupBy(
          schema.timeEntries.myhoursProjectId,
          schema.timeEntries.myhoursProjectName,
          schema.timeEntries.myhoursTaskId,
          schema.timeEntries.myhoursTaskName
        )
        .orderBy(sql`count(*) desc`),
      database
        .select({
          unknownUserCount: schema.myhoursSyncRuns.unknownUserCount,
          finishedAt: schema.myhoursSyncRuns.finishedAt,
          error: schema.myhoursSyncRuns.error,
        })
        .from(schema.myhoursSyncRuns)
        .orderBy(desc(schema.myhoursSyncRuns.id))
        .limit(1),
    ])

    return NextResponse.json({
      week_start: startYmd,
      week_end: endYmd,
      scope: all ? "all" : "week",
      unknown_user_count: Number(lastRun?.unknownUserCount ?? 0),
      last_sync_finished_at: lastRun?.finishedAt ?? null,
      last_sync_error: lastRun?.error ?? null,
      groups: rows.map((r) => ({
        myhours_project_id: r.myhoursProjectId,
        myhours_project_name: r.myhoursProjectName,
        myhours_task_id: r.myhoursTaskId,
        myhours_task_name: r.myhoursTaskName,
        entry_count: Number(r.entryCount ?? 0),
        duration_minutes: Number(r.minutes ?? 0),
      })),
    })
  } catch (error) {
    console.error("Failed to list unmapped MyHours entries:", error)
    return NextResponse.json(
      {
        error: "Failed to list unmapped entries",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/myhours-mapping
 * One-click assign → mapping_source 'manual' + backfill project/task rows
 * (does not overwrite existing manual rows).
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth && auth.response) return auth.response

  try {
    const body = (await request.json()) as {
      myhours_project_id?: string | null
      myhours_task_id?: string | null
      client_id?: number | null
      mba_number?: string | null
    }

    const projectId = body.myhours_project_id?.trim() || null
    const taskId = body.myhours_task_id?.trim() || null
    if (!projectId && !taskId) {
      return NextResponse.json(
        {
          error: "bad_request",
          message: "myhours_project_id or myhours_task_id is required.",
        },
        { status: 400 }
      )
    }

    const mba =
      typeof body.mba_number === "string" && body.mba_number.trim()
        ? body.mba_number.trim().toLowerCase()
        : null
    const clientId =
      typeof body.client_id === "number" && Number.isFinite(body.client_id)
        ? body.client_id
        : null

    const database = getDb()
    const matchConds = [
      sql`${schema.timeEntries.mappingSource} IN ('unmapped', 'name_match')`,
    ]
    if (projectId) {
      matchConds.push(eq(schema.timeEntries.myhoursProjectId, projectId))
    }
    if (taskId) {
      matchConds.push(eq(schema.timeEntries.myhoursTaskId, taskId))
    }

    const updated = await database
      .update(schema.timeEntries)
      .set({
        clientId,
        mbaNumber: mba,
        mappingSource: "manual",
      })
      .where(and(...matchConds))
      .returning({ id: schema.timeEntries.id })

    return NextResponse.json({ updated: updated.length })
  } catch (error) {
    console.error("Failed to map MyHours entries:", error)
    return NextResponse.json(
      {
        error: "Failed to map entries",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
