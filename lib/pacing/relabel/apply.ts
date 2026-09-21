import { parseMbaNumberFromLineItemId } from "@/lib/mediaplan/lineItemIds"
import {
  sessionExecuteRows,
  sessionExecuteVoid,
  withSnowflakeSession,
} from "@/lib/snowflake/snowflakeSession"
import { RelabelApplyError, assertApplyAllowed, buildApplyLogPayload } from "./applyGuard"
import { asIsoDate, factRouteForChannel, isCm360Channel, normalizeLineItemId } from "./channels"
import { assertRelabelTablesAvailable, insertRelabelApply } from "./repo"
import type { RelabelActiveMap, RelabelApplyResult, RelabelDeletedRow, RelabelPreview } from "./types"
import { LINE_ITEM_LABEL_MAP } from "./types"

export { RelabelApplyError, assertApplyAllowed, buildApplyLogPayload }

function dateFilterSql(dateFrom: string | null, dateTo: string | null): string {
  const from = dateFrom ? "AND CAST(DATE_DAY AS DATE) >= CAST(? AS DATE)" : ""
  const to = dateTo ? "AND CAST(DATE_DAY AS DATE) <= CAST(? AS DATE)" : ""
  return `${from} ${to}`
}

function entityMatchSql(route: ReturnType<typeof factRouteForChannel>): string {
  if (route.fallbackKey) {
    return `(LOWER(TRIM(CAST(LINE_ITEM_NAME AS VARCHAR))) = LOWER(TRIM(?))
      OR LOWER(TRIM(CAST(PLATFORM_LINE_ITEM_ID AS VARCHAR))) = LOWER(TRIM(?)))`
  }
  return `LOWER(TRIM(CAST(PLATFORM_LINE_ITEM_ID AS VARCHAR))) = LOWER(TRIM(?))`
}

function entityMatchBinds(platformEntityId: string, route: ReturnType<typeof factRouteForChannel>): unknown[] {
  return route.fallbackKey ? [platformEntityId, platformEntityId] : [platformEntityId]
}

export type ApplyRelabelOpts = {
  reason: string
  actorEmail: string
  acknowledgeWarnings?: boolean
  now?: Date
}

export async function applyRelabel(
  preview: RelabelPreview,
  opts: ApplyRelabelOpts,
): Promise<RelabelApplyResult> {
  assertApplyAllowed(preview, opts)
  await assertRelabelTablesAvailable()

  const reason = String(opts.reason ?? "").trim()
  const actorEmail = String(opts.actorEmail ?? "").trim()
  if (!reason) throw new RelabelApplyError("invalid", "reason is required.")
  if (!actorEmail) throw new RelabelApplyError("invalid", "actorEmail is required.")

  const lineItemId = normalizeLineItemId(preview.lineItemId)
  const channel = preview.channel
  const platformEntityId = preview.platformEntityId
  const route = factRouteForChannel(channel)
  const now = opts.now ?? new Date()
  const notes = `${reason} | ${actorEmail} | ${now.toISOString()}`
  const mbaNumber =
    preview.mbaNumber ??
    parseMbaNumberFromLineItemId(lineItemId)?.toLowerCase() ??
    ""

  const snowflake = await withSnowflakeSession(async (session) => {
    await sessionExecuteVoid(session, "BEGIN")
    try {
      const priorRows = await sessionExecuteRows<RelabelActiveMap & Record<string, unknown>>(
        session,
        `
        SELECT
          CHANNEL,
          CAST(PLATFORM_LINE_ITEM_ID AS VARCHAR) AS PLATFORM_LINE_ITEM_ID,
          CAST(LINE_ITEM_ID AS VARCHAR) AS LINE_ITEM_ID,
          CAST(LINE_ITEM_NAME AS VARCHAR) AS LINE_ITEM_NAME,
          CAST(MBA_NUMBER AS VARCHAR) AS MBA_NUMBER,
          CAST(NOTES AS VARCHAR) AS NOTES
        FROM ${LINE_ITEM_LABEL_MAP}
        WHERE LOWER(TRIM(CHANNEL)) = LOWER(TRIM(?))
          AND LOWER(TRIM(CAST(PLATFORM_LINE_ITEM_ID AS VARCHAR))) = LOWER(TRIM(?))
          AND IS_ACTIVE = TRUE
        `,
        [channel, platformEntityId],
      )
      const priorActiveMap: RelabelActiveMap | null = priorRows[0]
        ? {
            channel: String(priorRows[0].CHANNEL ?? channel),
            platformLineItemId: String(priorRows[0].PLATFORM_LINE_ITEM_ID ?? platformEntityId),
            lineItemId: normalizeLineItemId(priorRows[0].LINE_ITEM_ID as string | null) || null,
            lineItemName: priorRows[0].LINE_ITEM_NAME == null ? null : String(priorRows[0].LINE_ITEM_NAME),
            mbaNumber: priorRows[0].MBA_NUMBER == null ? null : String(priorRows[0].MBA_NUMBER),
            notes: priorRows[0].NOTES == null ? null : String(priorRows[0].NOTES),
          }
        : preview.activeMap

      await sessionExecuteVoid(
        session,
        `
        UPDATE ${LINE_ITEM_LABEL_MAP}
        SET IS_ACTIVE = FALSE
        WHERE LOWER(TRIM(CHANNEL)) = LOWER(TRIM(?))
          AND LOWER(TRIM(CAST(PLATFORM_LINE_ITEM_ID AS VARCHAR))) = LOWER(TRIM(?))
          AND IS_ACTIVE = TRUE
        `,
        [channel, platformEntityId],
      )

      await sessionExecuteVoid(
        session,
        `
        INSERT INTO ${LINE_ITEM_LABEL_MAP}
          (CHANNEL, PLATFORM_LINE_ITEM_ID, LINE_ITEM_ID, LINE_ITEM_NAME, MBA_NUMBER, NOTES, IS_ACTIVE)
        VALUES (?, ?, ?, ?, ?, ?, TRUE)
        `,
        [channel, platformEntityId, lineItemId, preview.entityName, mbaNumber, notes],
      )

      const dateBinds: unknown[] = []
      if (preview.dateFrom) dateBinds.push(preview.dateFrom)
      if (preview.dateTo) dateBinds.push(preview.dateTo)

      const setName = route.updateLineItemName ? ", LINE_ITEM_NAME = ?" : ""
      const updateBinds = route.updateLineItemName
        ? [lineItemId, preview.entityName, channel, ...entityMatchBinds(platformEntityId, route), ...dateBinds]
        : [lineItemId, channel, ...entityMatchBinds(platformEntityId, route), ...dateBinds]

      await sessionExecuteVoid(
        session,
        `
        UPDATE ${route.table}
        SET LINE_ITEM_ID = ?${setName}
        WHERE LOWER(TRIM(CHANNEL)) = LOWER(TRIM(?))
          AND ${entityMatchSql(route)}
          ${dateFilterSql(preview.dateFrom, preview.dateTo)}
        `,
        updateBinds,
      )

      const countRows = await sessionExecuteRows<{ ROWS_UPDATED: number }>(
        session,
        `
        SELECT COUNT(*) AS ROWS_UPDATED
        FROM ${route.table}
        WHERE LOWER(TRIM(CHANNEL)) = LOWER(TRIM(?))
          AND ${entityMatchSql(route)}
          AND LOWER(TRIM(CAST(LINE_ITEM_ID AS VARCHAR))) = ?
          ${dateFilterSql(preview.dateFrom, preview.dateTo)}
        `,
        [channel, ...entityMatchBinds(platformEntityId, route), lineItemId, ...dateBinds],
      )
      const rowsUpdated = Number(countRows[0]?.ROWS_UPDATED) || 0

      const deletedDuplicateRows: RelabelDeletedRow[] = []
      if (isCm360Channel(channel) && preview.duplicateOldNameDays.length > 0) {
        const placeholders = preview.duplicateOldNameDays.map(() => "?").join(", ")
        const snapshot = await sessionExecuteRows<Record<string, unknown>>(
          session,
          `
          SELECT
            CAST(DATE_DAY AS DATE) AS DATE_DAY,
            CHANNEL,
            TRIM(CAST(LINE_ITEM_NAME AS VARCHAR)) AS LINE_ITEM_NAME,
            CAST(LINE_ITEM_ID AS VARCHAR) AS LINE_ITEM_ID,
            CAST(PLATFORM_LINE_ITEM_ID AS VARCHAR) AS PLATFORM_LINE_ITEM_ID,
            AMOUNT_SPENT,
            IMPRESSIONS,
            CLICKS,
            RESULTS
          FROM ${route.table}
          WHERE LOWER(TRIM(CHANNEL)) = LOWER(TRIM(?))
            AND LOWER(TRIM(CAST(LINE_ITEM_NAME AS VARCHAR))) = LOWER(TRIM(?))
            AND CAST(DATE_DAY AS DATE) IN (${placeholders})
          `,
          [channel, preview.entityName, ...preview.duplicateOldNameDays],
        )
        for (const row of snapshot) {
          deletedDuplicateRows.push({
            dateDay: asIsoDate(row.DATE_DAY),
            channel: String(row.CHANNEL ?? channel),
            lineItemName: String(row.LINE_ITEM_NAME ?? preview.entityName),
            lineItemId: normalizeLineItemId(row.LINE_ITEM_ID as string | null) || null,
            platformLineItemId:
              row.PLATFORM_LINE_ITEM_ID == null ? null : String(row.PLATFORM_LINE_ITEM_ID),
            amountSpent: Number(row.AMOUNT_SPENT) || 0,
            impressions: Number(row.IMPRESSIONS) || 0,
            clicks: Number(row.CLICKS) || 0,
            results: Number(row.RESULTS) || 0,
          })
        }
        await sessionExecuteVoid(
          session,
          `
          DELETE FROM ${route.table}
          WHERE LOWER(TRIM(CHANNEL)) = LOWER(TRIM(?))
            AND LOWER(TRIM(CAST(LINE_ITEM_NAME AS VARCHAR))) = LOWER(TRIM(?))
            AND CAST(DATE_DAY AS DATE) IN (${placeholders})
          `,
          [channel, preview.entityName, ...preview.duplicateOldNameDays],
        )
      }

      await sessionExecuteVoid(session, "COMMIT")
      return {
        rowsUpdated,
        rowsDeleted: deletedDuplicateRows.length,
        priorActiveMap,
        deletedDuplicateRows,
      }
    } catch (err) {
      await sessionExecuteVoid(session, "ROLLBACK").catch(() => {})
      throw err
    }
  })

  const beforeState = buildApplyLogPayload(preview, {
    priorActiveMap: snowflake.priorActiveMap,
    deletedDuplicateRows: snowflake.deletedDuplicateRows,
  })

  const saved = await insertRelabelApply({
    channel,
    platformEntityId,
    entityName: preview.entityName,
    fromLineItemId: preview.moves[0]?.previousLineItemId ?? null,
    toLineItemId: lineItemId,
    mbaNumber,
    dateFrom: preview.dateFrom,
    dateTo: preview.dateTo,
    reason,
    actorEmail,
    beforeState,
    applyResult: {
      rowsUpdated: snowflake.rowsUpdated,
      rowsDeleted: snowflake.rowsDeleted,
    },
  })

  return {
    relabelId: saved.id,
    rowsUpdated: snowflake.rowsUpdated,
    rowsDeleted: snowflake.rowsDeleted,
    mapInserted: true,
    beforeState,
  }
}
