import "server-only"

import { querySnowflake } from "@/lib/snowflake/client"
import {
  buildSnapshotPruneDeleteSql,
  buildSnapshotPruneMergeSql,
  buildSnapshotPruneQueries,
  buildSnapshotPruneStageCreateSql,
  buildSnapshotPruneStageInsertSql,
  formatSnapshotPruneLog,
  normaliseSnapshotPruneMode,
  normaliseSnapshotPruneSampleRow,
  readSnapshotPruneMax,
  readSnapshotPruneCount,
} from "@/lib/snowflake/xanoLineItemPruneDryRun"
import type { XanoLineItem } from "@/lib/xano/fetchAllLineItems"

const SNAPSHOT = "ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT"

const BATCH_SIZE = 500

function dedupeByLineItemId(items: XanoLineItem[]): {
  deduped: XanoLineItem[]
  duplicateCount: number
} {
  const byId = new Map<string, XanoLineItem>()

  for (const item of items) {
    const existing = byId.get(item.line_item_id)
    if (!existing) {
      byId.set(item.line_item_id, item)
    } else {
      const existingTime = existing.xano_created_at || 0
      const itemTime = item.xano_created_at || 0
      if (itemTime > existingTime || (itemTime === existingTime && item.xano_row_id > existing.xano_row_id)) {
        byId.set(item.line_item_id, item)
      }
    }
  }

  return {
    deduped: Array.from(byId.values()),
    duplicateCount: items.length - byId.size,
  }
}

function buildBatchMergeSql(rowCount: number): string {
  const valuesPlaceholders = Array(rowCount)
    .fill("(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .join(",\n    ")

  return `
    MERGE INTO ${SNAPSHOT} t
    USING (
      SELECT
        column1::VARCHAR AS LINE_ITEM_ID,
        column2::VARCHAR AS MBA_NUMBER,
        column3::VARCHAR AS LINE_ITEM_NAME,
        column4::VARCHAR AS PLATFORM,
        column5::VARCHAR AS BUY_TYPE,
        column6::BOOLEAN AS FIXED_COST_MEDIA,
        PARSE_JSON(column7) AS BURSTS_JSON,
        column8::VARCHAR AS SOURCE_TABLE,
        column9::NUMBER AS XANO_ROW_ID,
        column10::NUMBER AS XANO_CREATED_AT
      FROM VALUES
        ${valuesPlaceholders}
    ) s
    ON t.LINE_ITEM_ID = s.LINE_ITEM_ID
    WHEN MATCHED THEN UPDATE SET
      MBA_NUMBER       = s.MBA_NUMBER,
      LINE_ITEM_NAME   = s.LINE_ITEM_NAME,
      PLATFORM         = s.PLATFORM,
      BUY_TYPE         = s.BUY_TYPE,
      FIXED_COST_MEDIA = s.FIXED_COST_MEDIA,
      BURSTS_JSON      = s.BURSTS_JSON,
      SOURCE_TABLE     = s.SOURCE_TABLE,
      XANO_ROW_ID      = s.XANO_ROW_ID,
      XANO_CREATED_AT  = s.XANO_CREATED_AT,
      SYNCED_AT        = CURRENT_TIMESTAMP()
    WHEN NOT MATCHED THEN INSERT (
      LINE_ITEM_ID, MBA_NUMBER, LINE_ITEM_NAME, PLATFORM, BUY_TYPE,
      FIXED_COST_MEDIA, BURSTS_JSON, SOURCE_TABLE, XANO_ROW_ID, XANO_CREATED_AT, SYNCED_AT
    ) VALUES (
      s.LINE_ITEM_ID, s.MBA_NUMBER, s.LINE_ITEM_NAME, s.PLATFORM, s.BUY_TYPE,
      s.FIXED_COST_MEDIA, s.BURSTS_JSON, s.SOURCE_TABLE, s.XANO_ROW_ID, s.XANO_CREATED_AT, CURRENT_TIMESTAMP()
    )
  `
}

type SyncLineItemsResult = {
  total: number
  succeeded: number
  failed: number
  errors: string[]
  batches: number
  duplicates_collapsed: number
}

function buildRowBinds(items: XanoLineItem[]): unknown[] {
  const binds: unknown[] = []

  for (const item of items) {
    const burstsPayload =
      item.bursts_json === undefined || item.bursts_json === null
        ? "[]"
        : JSON.stringify(item.bursts_json)

    binds.push(
      item.line_item_id,
      item.mba_number,
      item.line_item_name,
      item.platform,
      item.buy_type,
      item.fixed_cost_media,
      burstsPayload,
      item.source_table,
      item.xano_row_id,
      item.xano_created_at
    )
  }

  return binds
}

async function mergeLineItemBatches(deduped: XanoLineItem[], result: SyncLineItemsResult): Promise<void> {
  for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
    const batch = deduped.slice(i, i + BATCH_SIZE)
    const sql = buildBatchMergeSql(batch.length)

    try {
      await querySnowflake(sql, buildRowBinds(batch), {
        label: `xano_snapshot_batch_merge_${batch.length}`,
      })
      result.succeeded += batch.length
      result.batches += 1
    } catch (err) {
      result.failed += batch.length
      const batchOrdinal = Math.floor(i / BATCH_SIZE) + 1
      result.errors.push(
        `Batch ${batchOrdinal} (${batch.length} rows starting at index ${i}): ${
          err instanceof Error ? err.message : String(err)
        }`
      )
    }
  }
}

function buildPruneStageTableName(): string {
  const suffix = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "")

  return `ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_PRUNE_STAGE_${suffix}`
}

async function dropPruneStage(stageTable: string): Promise<void> {
  try {
    await querySnowflake(`DROP TABLE IF EXISTS ${stageTable}`, [], {
      label: "xano_snapshot_prune_stage_drop",
    })
  } catch (err) {
    console.warn(
      `[xano-sync] snapshot prune stage cleanup failed: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}

async function stagePruneRows(stageTable: string, deduped: XanoLineItem[]): Promise<void> {
  await querySnowflake(buildSnapshotPruneStageCreateSql(stageTable), [], {
    label: "xano_snapshot_prune_stage_create",
  })

  for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
    const batch = deduped.slice(i, i + BATCH_SIZE)
    if (batch.length === 0) continue

    await querySnowflake(buildSnapshotPruneStageInsertSql(stageTable, batch.length), buildRowBinds(batch), {
      label: `xano_snapshot_prune_stage_insert_${batch.length}`,
    })
  }
}

async function syncLineItemsWithActivePrune(
  deduped: XanoLineItem[],
  result: SyncLineItemsResult
): Promise<void> {
  const pruneQueries = buildSnapshotPruneQueries(
    deduped.map((item) => item.line_item_id),
    "active"
  )

  const countRows = await querySnowflake<Record<string, unknown>>(
    pruneQueries.countSql,
    pruneQueries.binds,
    { label: "xano_snapshot_prune_count_active" }
  )
  const { orphanCount } = readSnapshotPruneCount(countRows[0])
  const pruneMax = readSnapshotPruneMax(process.env.SNAPSHOT_PRUNE_MAX)

  if (orphanCount > pruneMax) {
    console.error(
      `[xano-sync] prune aborted: orphan count ${orphanCount} exceeds SNAPSHOT_PRUNE_MAX ${pruneMax} — possible keep-set error`
    )
    await mergeLineItemBatches(deduped, result)
    return
  }

  const stageTable = buildPruneStageTableName()
  let transactionStarted = false

  try {
    await stagePruneRows(stageTable, deduped)
    await querySnowflake("BEGIN", [], { label: "xano_snapshot_prune_begin" })
    transactionStarted = true
    await querySnowflake(buildSnapshotPruneDeleteSql(stageTable), [], {
      label: "xano_snapshot_prune_delete",
    })
    await querySnowflake(buildSnapshotPruneMergeSql(stageTable), [], {
      label: "xano_snapshot_prune_merge",
    })
    await querySnowflake("COMMIT", [], { label: "xano_snapshot_prune_commit" })
    transactionStarted = false

    result.succeeded += deduped.length
    if (deduped.length > 0) result.batches += 1
    console.log(`[xano-sync] snapshot prune active: orphans deleted=${orphanCount}, rows merged=${deduped.length}`)
  } catch (err) {
    if (transactionStarted) {
      try {
        await querySnowflake("ROLLBACK", [], { label: "xano_snapshot_prune_rollback" })
      } catch (rollbackErr) {
        console.error(
          `[xano-sync] snapshot prune rollback failed: ${
            rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)
          }`
        )
      }
    }

    const message = err instanceof Error ? err.message : String(err)
    console.error(`[xano-sync] active prune transaction failed: ${message}`)
    result.failed += deduped.length
    result.errors.push(`Active prune transaction: ${message}`)
  } finally {
    await dropPruneStage(stageTable)
  }
}

export async function syncLineItemsToSnowflake(items: XanoLineItem[], complete: boolean): Promise<{
  total: number
  succeeded: number
  failed: number
  errors: string[]
  batches: number
  duplicates_collapsed: number
}> {
  const { deduped, duplicateCount } = dedupeByLineItemId(items)

  const result = {
    total: items.length,
    succeeded: 0,
    failed: 0,
    errors: [] as string[],
    batches: 0,
    duplicates_collapsed: duplicateCount,
  }

  if (duplicateCount > 0) {
    console.warn(
      `[xano-sync] Collapsed ${duplicateCount} duplicate line_item_ids from input (${items.length} → ${deduped.length})`
    )
  }

  const pruneMode = normaliseSnapshotPruneMode(process.env.SNAPSHOT_PRUNE_MODE)

  if (pruneMode === "active" && complete) {
    await syncLineItemsWithActivePrune(deduped, result)
    return result
  }

  await mergeLineItemBatches(deduped, result)

  if (!complete) {
    console.log("[xano-sync] prune skipped: incomplete fetch")
    return result
  }

  if (pruneMode === "off") {
    console.log("[xano-sync] snapshot prune skipped: SNAPSHOT_PRUNE_MODE=off")
    return result
  }

  const pruneQueries = buildSnapshotPruneQueries(
    deduped.map((item) => item.line_item_id),
    pruneMode
  )

  const countRows = await querySnowflake<Record<string, unknown>>(
    pruneQueries.countSql,
    pruneQueries.binds,
    { label: `xano_snapshot_prune_count_${pruneMode}` }
  )
  const sampleRows = await querySnowflake<Record<string, unknown>>(
    pruneQueries.sampleSql,
    pruneQueries.binds,
    { label: `xano_snapshot_prune_sample_${pruneMode}` }
  )

  const counts = readSnapshotPruneCount(countRows[0])
  const sample = sampleRows.map(normaliseSnapshotPruneSampleRow)
  console.log(formatSnapshotPruneLog({ mode: pruneMode, ...counts, sample }))

  return result
}
