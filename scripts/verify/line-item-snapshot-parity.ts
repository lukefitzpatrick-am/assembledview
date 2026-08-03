/**
 * Author-only: Xano vs PG line-item snapshot parity (no Snowflake write).
 *
 * Both sides tip-scoped via PG `published_version_id` (X7 v3).
 *
 *   npm run verify:line-item-snapshot-parity
 */
import { readFileSync } from "node:fs"

import { closeDb } from "@/db"
import { auditPublishedVersionPointers } from "@/lib/snowflake/publishedVersionPointerAudit"
import { fetchAllPgLineItems } from "@/lib/snowflake/fetchAllPgLineItems"
import { buildLineItemSnapshotParityReport } from "@/lib/snowflake/syncPgLineItems"
import { filterXanoItemsToPublishedTips } from "@/lib/snowflake/tipScopeLineItems"
import { fetchAllXanoLineItems } from "@/lib/xano/fetchAllLineItems"

function loadEnvLocal() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = line.match(/^([^#=]+)=(.*)$/)
      if (!m) continue
      const k = m[1].trim()
      let v = m[2].trim()
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1)
      }
      if (!process.env[k]) process.env[k] = v
    }
  } catch {
    // optional
  }
}

async function main() {
  loadEnvLocal()
  const started = Date.now()

  const pointerAudit = await auditPublishedVersionPointers()
  const [xano, pg] = await Promise.all([
    fetchAllXanoLineItems(),
    fetchAllPgLineItems(), // default tip scope
  ])

  const tipScoped = filterXanoItemsToPublishedTips(
    xano.items,
    pointerAudit.tip_pointers
  )

  const report = buildLineItemSnapshotParityReport(tipScoped.items, pg.items, {
    xanoComplete: xano.complete,
    pgComplete: pg.complete,
    sampleSize: 40,
  })

  console.log(
    JSON.stringify(
      {
        duration_ms: Date.now() - started,
        scope: {
          both_sides: "tip",
          tip_pointer: "media_plan_masters.published_version_id",
          xano_tip_filter:
            "media_plan_version FK == published_version_id (fallback version_number)",
        },
        reader_contract: {
          answer:
            "Snapshot consumers expect pre-scoped tip rows. Warehouse readers SELECT from MART.XANO_LINE_ITEMS_SNAPSHOT with no version/tip filter (e.g. sp_refresh_fixed_cost_reported_daily WHERE FIXED_COST_MEDIA). Ingest MERGE keys only on LINE_ITEM_ID and collapses duplicates by newest xano_created_at — it does not tip-select. Live pacing pages tip-select from Xano channel tables (filterByMbaAndVersion), not from the snapshot.",
          confidence_pct: 88,
        },
        pointer_audit: {
          masters_total: pointerAudit.masters_total,
          tips_with_pointer: pointerAudit.tips_with_pointer,
          null_published_count: pointerAudit.null_published.length,
          stale_vs_latest_booked_count: pointerAudit.stale_vs_latest_booked.length,
          null_published: pointerAudit.null_published,
          stale_vs_latest_booked: pointerAudit.stale_vs_latest_booked,
        },
        xano_tip_scope: tipScoped.stats,
        ...report,
        xano_raw_all_versions: tipScoped.stats.input,
        mismatched: report.mismatched.slice(0, 200),
        mismatched_truncated: report.mismatched.length > 200,
      },
      null,
      2
    )
  )

  await closeDb()
  if (report.mba_mismatches > 0) process.exitCode = 2
}

main().catch(async (err) => {
  console.error(err)
  try {
    await closeDb()
  } catch {
    // ignore
  }
  process.exit(1)
})
