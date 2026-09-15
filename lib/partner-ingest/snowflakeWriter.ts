import type { Connection } from "snowflake-sdk"

import {
  DELETE_DELIVERY_RANGE_SQL,
  DELIVERY_INSERT_BATCH,
  INSERT_DELIVERY_SQL,
  INSERT_FILE_LINE_SQL,
  INSERT_INGEST_LOG_SQL,
  LINE_INSERT_BATCH,
  SELECT_LOADED_DUPLICATE_SQL,
  SELECT_SOURCE_MAP_SQL,
  assertNoRawUpdate,
  deliveryInsertBinds,
  ingestLogBinds,
  lineInsertBinds,
} from "./sql"
import type { PartnerSourceMapRow } from "./types"
import type { PartnerSnowflakePort } from "./runPartnerIngest"

export type SnowflakeQueryFn = (
  sqlText: string,
  binds?: unknown[]
) => Promise<Record<string, unknown>[]>

export type SnowflakeSessionFn = <T>(
  fn: (connection: Connection) => Promise<T>
) => Promise<T>

export type SnowflakeExecuteVoidFn = (
  connection: Connection,
  sqlText: string,
  binds?: unknown[]
) => Promise<void>

export type PartnerSnowflakeWriterDeps = {
  query: SnowflakeQueryFn
  withSession: SnowflakeSessionFn
  executeVoid: SnowflakeExecuteVoidFn
}

function asString(v: unknown): string {
  return v == null ? "" : String(v)
}

function asNullableString(v: unknown): string | null {
  if (v == null) return null
  const s = String(v)
  return s === "" ? null : s
}

function asNumber(v: unknown): number | null {
  if (v == null || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function asBool(v: unknown): boolean {
  return v === true || v === 1 || String(v).toLowerCase() === "true"
}

export function mapSourceMapRow(row: Record<string, unknown>): PartnerSourceMapRow {
  return {
    senderDomain: asString(row.SENDER_DOMAIN ?? row.sender_domain),
    subjectPattern: asNullableString(row.SUBJECT_PATTERN ?? row.subject_pattern),
    sourceSlug: asString(row.SOURCE_SLUG ?? row.source_slug),
    sourceLabel: asString(row.SOURCE_LABEL ?? row.source_label),
    isActive: asBool(row.IS_ACTIVE ?? row.is_active ?? true),
    expectedHeader: asNullableString(row.EXPECTED_HEADER ?? row.expected_header),
    headerRowHint: asNumber(row.HEADER_ROW_HINT ?? row.header_row_hint),
    maxStaleDays: asNumber(row.MAX_STALE_DAYS ?? row.max_stale_days),
    loadMode: asNullableString(row.LOAD_MODE ?? row.load_mode),
  }
}

async function insertBatched(
  session: Connection,
  executeVoid: SnowflakeExecuteVoidFn,
  sqlForCount: (n: number) => string,
  binds: unknown[],
  paramsPerRow: number,
  batchRows: number
): Promise<void> {
  const rowCount = binds.length / paramsPerRow
  for (let i = 0; i < rowCount; i += batchRows) {
    const take = Math.min(batchRows, rowCount - i)
    const sql = sqlForCount(take)
    assertNoRawUpdate(sql)
    const slice = binds.slice(i * paramsPerRow, (i + take) * paramsPerRow)
    await executeVoid(session, sql, slice)
  }
}

export function createPartnerSnowflakeWriter(
  deps: PartnerSnowflakeWriterDeps
): PartnerSnowflakePort {
  return {
    async loadSourceMap() {
      assertNoRawUpdate(SELECT_SOURCE_MAP_SQL)
      const rows = await deps.query(SELECT_SOURCE_MAP_SQL)
      return rows.map(mapSourceMapRow)
    },

    async hasLoadedDuplicate(input) {
      assertNoRawUpdate(SELECT_LOADED_DUPLICATE_SQL)
      const rows = await deps.query(SELECT_LOADED_DUPLICATE_SQL, [
        input.internetMessageId,
        input.attachmentName,
        input.attachmentSha256,
      ])
      return rows.length > 0
    },

    async insertRawLines(input) {
      if (input.lines.length === 0) return
      await deps.withSession(async (session) => {
        await insertBatched(
          session,
          deps.executeVoid,
          INSERT_FILE_LINE_SQL,
          lineInsertBinds(input.sourceFile, input.lines),
          3,
          LINE_INSERT_BATCH
        )
      })
    },

    async writeLoadAndLog(input) {
      await deps.withSession(async (session) => {
        if (input.load) {
          assertNoRawUpdate("BEGIN")
          await deps.executeVoid(session, "BEGIN")
          try {
            assertNoRawUpdate(DELETE_DELIVERY_RANGE_SQL)
            await deps.executeVoid(session, DELETE_DELIVERY_RANGE_SQL, [
              input.load.source,
              input.load.minDate,
              input.load.maxDate,
            ])
            await insertBatched(
              session,
              deps.executeVoid,
              INSERT_DELIVERY_SQL,
              deliveryInsertBinds(
                input.load.source,
                input.load.sourceFile,
                input.load.rows
              ),
              18,
              DELIVERY_INSERT_BATCH
            )
            assertNoRawUpdate("COMMIT")
            await deps.executeVoid(session, "COMMIT")
          } catch (err) {
            await deps.executeVoid(session, "ROLLBACK").catch(() => {})
            throw err
          }
        }
        assertNoRawUpdate(INSERT_INGEST_LOG_SQL)
        await deps.executeVoid(
          session,
          INSERT_INGEST_LOG_SQL,
          ingestLogBinds(input.log)
        )
      })
    },
  }
}

