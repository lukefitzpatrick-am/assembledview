import { NextResponse } from "next/server"

import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import { fetchAllXanoLineItems } from "@/lib/xano/fetchAllLineItems"
import { syncLineItemsToSnowflake } from "@/lib/snowflake/syncXanoLineItems"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json(
      { error: "unauthorised", hint: "cron_secret_required" },
      { status: 401 }
    )
  }

  const startedAt = new Date()
  console.log(`[xano-sync] Started at ${startedAt.toISOString()}`)

  try {
    const items = await fetchAllXanoLineItems()
    console.log(`[xano-sync] Fetched ${items.length} line items from Xano`)

    const result = await syncLineItemsToSnowflake(items)

    const completedAt = new Date()
    const durationMs = completedAt.getTime() - startedAt.getTime()
    console.log(
      `[xano-sync] Completed in ${durationMs}ms: ${result.succeeded} succeeded, ${result.failed} failed, ${result.batches} batches`
    )

    if (result.failed > 0) {
      console.error("[xano-sync] Errors:", result.errors.slice(0, 10))
    }

    return NextResponse.json({
      status: "ok",
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: durationMs,
      total: result.total,
      succeeded: result.succeeded,
      failed: result.failed,
      batches: result.batches,
      sample_errors: result.errors.slice(0, 5),
    })
  } catch (err) {
    console.error("[xano-sync] Fatal error:", err)
    return NextResponse.json(
      {
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }
}
