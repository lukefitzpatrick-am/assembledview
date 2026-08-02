import { NextResponse } from "next/server"

import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import {
  normaliseLineItemSnapshotSource,
  runLineItemSnapshotSync,
} from "@/lib/snowflake/syncPgLineItems"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * Daily line-item snapshot → Snowflake `MART.XANO_LINE_ITEMS_SNAPSHOT`.
 *
 * Source: `LINE_ITEM_SNAPSHOT_SOURCE` = `xano` | `parity` | `postgres`
 * (default `xano`). Parity reports MBA row/spend diffs and still MERGEs Xano.
 * STOP: Luke sets `postgres` only after a clean parity report — see
 * `docs/superpowers/x7-line-item-snapshot-pg-stop-2026-08-02.md`.
 * Route path retires at T7 after the flip.
 */

export async function GET(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json(
      { error: "unauthorised", hint: "cron_secret_required" },
      { status: 401 }
    )
  }

  const startedAt = new Date()
  const source = normaliseLineItemSnapshotSource(
    process.env.LINE_ITEM_SNAPSHOT_SOURCE
  )
  console.log(
    `[line-item-snapshot] Started at ${startedAt.toISOString()} source=${source}`
  )

  try {
    const result = await runLineItemSnapshotSync(source)

    const completedAt = new Date()
    const durationMs = completedAt.getTime() - startedAt.getTime()
    const sync = result.sync

    console.log(
      `[line-item-snapshot] Completed in ${durationMs}ms write=${result.write_source}` +
        (sync
          ? `: ${sync.succeeded} succeeded, ${sync.failed} failed, ${sync.batches} batches, ${sync.duplicates_collapsed} duplicates_collapsed`
          : "")
    )

    if (sync && sync.failed > 0) {
      console.error("[line-item-snapshot] Errors:", sync.errors.slice(0, 10))
    }

    if (result.parity) {
      console.log(
        `[line-item-snapshot] parity summary: mismatches=${result.parity.mba_mismatches} row_delta_abs=${result.parity.row_delta_abs_sum} spend_delta_abs=${result.parity.spend_delta_abs_sum}`
      )
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
      parity: result.parity
        ? {
            xano_raw: result.parity.xano_raw,
            pg_raw: result.parity.pg_raw,
            xano_deduped: result.parity.xano_deduped,
            pg_deduped: result.parity.pg_deduped,
            mba_count_xano: result.parity.mba_count_xano,
            mba_count_pg: result.parity.mba_count_pg,
            mba_mismatches: result.parity.mba_mismatches,
            row_delta_abs_sum: result.parity.row_delta_abs_sum,
            spend_delta_abs_sum: result.parity.spend_delta_abs_sum,
            sample: result.parity.sample,
            // Full mismatch list can be large — cap in HTTP body.
            mismatched: result.parity.mismatched.slice(0, 100),
            mismatched_truncated: result.parity.mismatched.length > 100,
          }
        : null,
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
