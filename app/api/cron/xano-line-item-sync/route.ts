import { NextResponse } from "next/server"

import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import { runLineItemSnapshotSync } from "@/lib/snowflake/syncPgLineItems"
import { logJob } from "@/lib/log"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * Daily line-item snapshot → Snowflake `MART.XANO_LINE_ITEMS_SNAPSHOT`.
 *
 * Always reads Postgres and MERGEs those rows. The route path and the table
 * name stay as the historic (frozen) contracts.
 */

export async function GET(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json(
      { error: "unauthorised", hint: "cron_secret_required" },
      { status: 401 }
    )
  }

  const startedAt = new Date()
  logJob(
    `[line-item-snapshot] Started at ${startedAt.toISOString()} source=postgres`
  )

  try {
    const result = await runLineItemSnapshotSync()

    const completedAt = new Date()
    const durationMs = completedAt.getTime() - startedAt.getTime()
    const sync = result.sync

    logJob(
      `[line-item-snapshot] Completed in ${durationMs}ms write=${result.write_source}` +
        (sync
          ? `: ${sync.succeeded} succeeded, ${sync.failed} failed, ${sync.batches} batches, ${sync.duplicates_collapsed} duplicates_collapsed`
          : "")
    )

    if (sync && sync.failed > 0) {
      console.error("[line-item-snapshot] Errors:", sync.errors.slice(0, 10))
    }

    return NextResponse.json({
      status: "ok",
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: durationMs,
      source: result.source,
      write_source: result.write_source,
      fetch_complete: result.fetch_complete,
      total: sync?.total ?? 0,
      succeeded: sync?.succeeded ?? 0,
      failed: sync?.failed ?? 0,
      batches: sync?.batches ?? 0,
      duplicates_collapsed: sync?.duplicates_collapsed ?? 0,
      sample_errors: sync?.errors.slice(0, 5) ?? [],
    })
  } catch (err) {
    console.error("[line-item-snapshot] Fatal error:", err)
    return NextResponse.json(
      {
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }
}
