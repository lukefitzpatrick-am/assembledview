import {
  sessionExecuteVoid,
  withSnowflakeSession,
} from "@/lib/snowflake/snowflakeSession"
import { factRouteForChannel, normalizeLineItemId } from "./channels"
import { getRelabel, markRelabelReverted } from "./repo"
import { revertPlanFromPayload } from "./revertPlan"
import { LINE_ITEM_LABEL_MAP } from "./types"

export { revertPlanFromPayload }

export class RelabelRevertError extends Error {
  constructor(
    public code: "not_found" | "already_reverted" | "invalid",
    message: string,
  ) {
    super(message)
    this.name = "RelabelRevertError"
  }
}

function dateFilterSql(dateFrom: string | null, dateTo: string | null): string {
  const from = dateFrom ? "AND CAST(DATE_DAY AS DATE) >= CAST(? AS DATE)" : ""
  const to = dateTo ? "AND CAST(DATE_DAY AS DATE) <= CAST(? AS DATE)" : ""
  return `${from} ${to}`
}

function entityMatchSql(hasFallback: boolean): string {
  if (hasFallback) {
    return `(LOWER(TRIM(CAST(LINE_ITEM_NAME AS VARCHAR))) = LOWER(TRIM(?))
      OR LOWER(TRIM(CAST(PLATFORM_LINE_ITEM_ID AS VARCHAR))) = LOWER(TRIM(?)))`
  }
  return `LOWER(TRIM(CAST(PLATFORM_LINE_ITEM_ID AS VARCHAR))) = LOWER(TRIM(?))`
}

export async function revertRelabel(
  relabelId: number,
  actorEmail: string,
): Promise<{ relabelId: number; restoredRanges: number; reinsertedRows: number }> {
  const email = String(actorEmail ?? "").trim()
  if (!email) throw new RelabelRevertError("invalid", "actorEmail is required.")

  const row = await getRelabel(relabelId)
  if (!row) throw new RelabelRevertError("not_found", `Relabel ${relabelId} was not found.`)
  if (row.status === "reverted") {
    throw new RelabelRevertError("already_reverted", `Relabel ${relabelId} is already reverted.`)
  }

  const plan = revertPlanFromPayload(row.beforeState)
  const route = factRouteForChannel(row.channel)
  const hasFallback = Boolean(route.fallbackKey)
  const entityBinds = hasFallback
    ? [row.platformEntityId, row.platformEntityId]
    : [row.platformEntityId]

  await withSnowflakeSession(async (session) => {
    await sessionExecuteVoid(session, "BEGIN")
    try {
      for (const range of plan.restoreRanges) {
        const previous = range.previousLineItemId
        const dateBinds: unknown[] = []
        if (row.dateFrom) dateBinds.push(row.dateFrom)
        if (row.dateTo) dateBinds.push(row.dateTo)
        const setName = route.updateLineItemName ? ", LINE_ITEM_NAME = ?" : ""
        const binds = route.updateLineItemName
          ? [previous, row.entityName, row.channel, ...entityBinds, row.toLineItemId, ...dateBinds]
          : [previous, row.channel, ...entityBinds, row.toLineItemId, ...dateBinds]
        await sessionExecuteVoid(
          session,
          `
          UPDATE ${route.table}
          SET LINE_ITEM_ID = ?${setName}
          WHERE LOWER(TRIM(CHANNEL)) = LOWER(TRIM(?))
            AND ${entityMatchSql(hasFallback)}
            AND LOWER(TRIM(CAST(LINE_ITEM_ID AS VARCHAR))) = ?
            ${dateFilterSql(row.dateFrom, row.dateTo)}
          `,
          binds,
        )
      }

      for (const deleted of plan.reinsertDeletedRows) {
        await sessionExecuteVoid(
          session,
          `
          INSERT INTO ${route.table}
            (CHANNEL, DATE_DAY, LINE_ITEM_NAME, LINE_ITEM_ID, PLATFORM_LINE_ITEM_ID, AMOUNT_SPENT, IMPRESSIONS, CLICKS, RESULTS)
          VALUES (?, CAST(? AS DATE), ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            deleted.channel,
            deleted.dateDay,
            deleted.lineItemName,
            deleted.lineItemId,
            deleted.platformLineItemId,
            deleted.amountSpent,
            deleted.impressions,
            deleted.clicks ?? 0,
            deleted.results ?? 0,
          ],
        )
      }

      await sessionExecuteVoid(
        session,
        `
        UPDATE ${LINE_ITEM_LABEL_MAP}
        SET IS_ACTIVE = FALSE
        WHERE LOWER(TRIM(CHANNEL)) = LOWER(TRIM(?))
          AND LOWER(TRIM(CAST(PLATFORM_LINE_ITEM_ID AS VARCHAR))) = LOWER(TRIM(?))
          AND LOWER(TRIM(CAST(LINE_ITEM_ID AS VARCHAR))) = ?
          AND IS_ACTIVE = TRUE
        `,
        [plan.deactivateMap.channel, plan.deactivateMap.platformEntityId, plan.deactivateMap.lineItemId],
      )

      if (plan.reactivateMap) {
        await sessionExecuteVoid(
          session,
          `
          UPDATE ${LINE_ITEM_LABEL_MAP}
          SET IS_ACTIVE = TRUE
          WHERE LOWER(TRIM(CHANNEL)) = LOWER(TRIM(?))
            AND LOWER(TRIM(CAST(PLATFORM_LINE_ITEM_ID AS VARCHAR))) = LOWER(TRIM(?))
            AND LOWER(TRIM(CAST(LINE_ITEM_ID AS VARCHAR))) = LOWER(TRIM(?))
          `,
          [
            plan.reactivateMap.channel,
            plan.reactivateMap.platformLineItemId,
            plan.reactivateMap.lineItemId,
          ],
        )
      }

      await sessionExecuteVoid(session, "COMMIT")
    } catch (err) {
      await sessionExecuteVoid(session, "ROLLBACK").catch(() => {})
      throw err
    }
  })

  await markRelabelReverted(relabelId, email, plan)

  return {
    relabelId,
    restoredRanges: plan.restoreRanges.length,
    reinsertedRows: plan.reinsertDeletedRows.length,
  }
}
