import "server-only"

import { LINE_ITEM_LABEL_MAP } from "./shared/types"

/**
 * The app's only writes to `MART.LINE_ITEM_LABEL_MAP` (B34, C-180).
 *
 * Rule: one active row per (`LOWER(TRIM(channel))`,
 * `LOWER(TRIM(platform_line_item_id))`), the key the LM1 view and
 * `labelMapOneCteSql` use. Snowflake does not enforce unique keys, and a
 * second active row multiplies delivery in the nightly refresh tasks.
 *
 * - Apply (`replaceActiveLabelMapRow`) deactivates every active row for the
 *   key, inserts one, then counts.
 * - Revert (`restorePriorLabelMapRow`) deactivates the relabel's own row and
 *   puts the prior row back as ONE new active row, only when the key has no
 *   active row left. It never flips old rows back to active (history can hold
 *   several rows with the same line id, and they would all come back), and it
 *   never restores over a later relabel's row.
 * - Both count active rows for the key after the write, inside the same
 *   transaction. More than one means another write landed at the same time.
 *   With `refuseSecondActive` (switch `relabel_map_one_active_guard`) the
 *   caller rolls back; without it the count is logged and the write commits.
 */

/** Runs SQL inside the caller's Snowflake session and transaction. */
export type LabelMapSql = {
  rows: <T = Record<string, unknown>>(sqlText: string, binds: unknown[]) => Promise<T[]>
  exec: (sqlText: string, binds: unknown[]) => Promise<void>
}

const KEY_MATCH = `LOWER(TRIM(CHANNEL)) = LOWER(TRIM(?))
          AND LOWER(TRIM(CAST(PLATFORM_LINE_ITEM_ID AS VARCHAR))) = LOWER(TRIM(?))`

/** Apply: every active row for the key goes inactive. */
export const LABEL_MAP_DEACTIVATE_KEY_SQL = `
        UPDATE ${LINE_ITEM_LABEL_MAP}
        SET IS_ACTIVE = FALSE
        WHERE ${KEY_MATCH}
          AND IS_ACTIVE = TRUE
        `

/** Revert: only the relabel's own active row goes inactive. */
export const LABEL_MAP_DEACTIVATE_LINE_SQL = `
        UPDATE ${LINE_ITEM_LABEL_MAP}
        SET IS_ACTIVE = FALSE
        WHERE ${KEY_MATCH}
          AND LOWER(TRIM(CAST(LINE_ITEM_ID AS VARCHAR))) = ?
          AND IS_ACTIVE = TRUE
        `

export const LABEL_MAP_INSERT_ACTIVE_SQL = `
        INSERT INTO ${LINE_ITEM_LABEL_MAP}
          (CHANNEL, PLATFORM_LINE_ITEM_ID, LINE_ITEM_ID, LINE_ITEM_NAME, MBA_NUMBER, NOTES, IS_ACTIVE)
        VALUES (?, ?, ?, ?, ?, ?, TRUE)
        `

export const LABEL_MAP_COUNT_ACTIVE_SQL = `
        SELECT COUNT(*) AS ACTIVE_ROWS
        FROM ${LINE_ITEM_LABEL_MAP}
        WHERE ${KEY_MATCH}
          AND IS_ACTIVE = TRUE
        `

/** Every key with more than one active row (the LM1 key). Read only. */
export const LABEL_MAP_DUPLICATE_ACTIVE_KEYS_SQL = `
  SELECT
    LOWER(TRIM(CHANNEL)) AS CHANNEL_KEY,
    LOWER(TRIM(CAST(PLATFORM_LINE_ITEM_ID AS VARCHAR))) AS PLATFORM_KEY,
    COUNT(*) AS ACTIVE_ROWS
  FROM ${LINE_ITEM_LABEL_MAP}
  WHERE IS_ACTIVE = TRUE
  GROUP BY 1, 2
  HAVING COUNT(*) > 1
  ORDER BY ACTIVE_ROWS DESC, CHANNEL_KEY, PLATFORM_KEY
`

export type LabelMapDuplicateKey = {
  channelKey: string
  platformKey: string
  activeRows: number
}

export function labelMapDuplicateKeysFromRows(rows: Array<Record<string, unknown>>): LabelMapDuplicateKey[] {
  return rows.map((row) => ({
    channelKey: String(row.CHANNEL_KEY ?? ""),
    platformKey: String(row.PLATFORM_KEY ?? ""),
    activeRows: Number(row.ACTIVE_ROWS) || 0,
  }))
}

export class LabelMapSecondActiveRowError extends Error {
  constructor(
    public channel: string,
    public platformEntityId: string,
    public activeRows: number,
  ) {
    super(
      `Another label map change for ${channel} / ${platformEntityId} landed at the same time, ` +
        `so this would leave ${activeRows} active map rows for one placement. Nothing was written. Reload and try again.`,
    )
    this.name = "LabelMapSecondActiveRowError"
  }
}

export type LabelMapWriteOpts = {
  /** Switch `relabel_map_one_active_guard`: roll back instead of logging. */
  refuseSecondActive: boolean
}

export type LabelMapRowValues = {
  channel: string
  platformEntityId: string
  lineItemId: string
  lineItemName: string | null
  mbaNumber: string | null
  notes: string | null
}

export async function countActiveLabelMapRows(
  sql: LabelMapSql,
  channel: string,
  platformEntityId: string,
): Promise<number> {
  const rows = await sql.rows<{ ACTIVE_ROWS: number | string }>(LABEL_MAP_COUNT_ACTIVE_SQL, [
    channel,
    platformEntityId,
  ])
  return Number(rows[0]?.ACTIVE_ROWS) || 0
}

async function checkOneActive(
  sql: LabelMapSql,
  channel: string,
  platformEntityId: string,
  opts: LabelMapWriteOpts,
): Promise<number> {
  const activeRows = await countActiveLabelMapRows(sql, channel, platformEntityId)
  if (activeRows > 1) {
    if (opts.refuseSecondActive) {
      throw new LabelMapSecondActiveRowError(channel, platformEntityId, activeRows)
    }
    console.warn(
      JSON.stringify({
        event: "relabel_label_map_second_active_row",
        channel,
        platformEntityId,
        activeRows,
      }),
    )
  }
  return activeRows
}

/** Apply: the key ends with exactly the inserted row active (checked). */
export async function replaceActiveLabelMapRow(
  sql: LabelMapSql,
  row: LabelMapRowValues,
  opts: LabelMapWriteOpts,
): Promise<{ activeRows: number }> {
  await sql.exec(LABEL_MAP_DEACTIVATE_KEY_SQL, [row.channel, row.platformEntityId])
  await sql.exec(LABEL_MAP_INSERT_ACTIVE_SQL, [
    row.channel,
    row.platformEntityId,
    row.lineItemId,
    row.lineItemName,
    row.mbaNumber,
    row.notes,
  ])
  const activeRows = await checkOneActive(sql, row.channel, row.platformEntityId, opts)
  return { activeRows }
}

export type RestorePriorLabelMapResult = {
  /** The prior row is active again (as one new row). */
  restored: boolean
  /** Why it was not restored. */
  skipped: "no_prior" | "another_active_row" | null
  activeRows: number
}

/**
 * Revert: deactivate the relabel's own row, then restore the prior mapping as
 * one new active row when nothing else is active for the key. A key that
 * already has an active row (a later relabel, or a hand-loaded row) keeps it.
 */
export async function restorePriorLabelMapRow(
  sql: LabelMapSql,
  args: {
    deactivate: { channel: string; platformEntityId: string; lineItemId: string }
    prior: LabelMapRowValues | null
  },
  opts: LabelMapWriteOpts,
): Promise<RestorePriorLabelMapResult> {
  const { deactivate, prior } = args
  await sql.exec(LABEL_MAP_DEACTIVATE_LINE_SQL, [
    deactivate.channel,
    deactivate.platformEntityId,
    deactivate.lineItemId,
  ])

  if (!prior || !prior.lineItemId) {
    return {
      restored: false,
      skipped: "no_prior",
      activeRows: await countActiveLabelMapRows(sql, deactivate.channel, deactivate.platformEntityId),
    }
  }

  const before = await countActiveLabelMapRows(sql, prior.channel, prior.platformEntityId)
  if (before > 0) {
    return { restored: false, skipped: "another_active_row", activeRows: before }
  }

  await sql.exec(LABEL_MAP_INSERT_ACTIVE_SQL, [
    prior.channel,
    prior.platformEntityId,
    prior.lineItemId,
    prior.lineItemName,
    prior.mbaNumber,
    prior.notes,
  ])
  const activeRows = await checkOneActive(sql, prior.channel, prior.platformEntityId, opts)
  return { restored: true, skipped: null, activeRows }
}
