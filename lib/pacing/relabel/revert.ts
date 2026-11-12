import "server-only"

import {
  sessionExecuteVoid,
  withSnowflakeSession,
} from "@/lib/snowflake/snowflakeSession"
import { factRouteForChannel, normalizeLineItemId } from "./shared/channels"
import { canRevertRelabel } from "./shared/relabelPageUrl"
import { getRelabel, markRelabelReverted } from "./repo"
import { revertPlanFromPayload } from "./revertPlan"
import { LabelMapSecondActiveRowError, restorePriorLabelMapRow } from "./labelMapActive"
import { labelMapSqlForSession, readRelabelMapOneActiveGuard } from "./labelMapSession"

export { revertPlanFromPayload }

export class RelabelRevertError extends Error {
  constructor(
    public code: "not_found" | "already_reverted" | "invalid" | "expired" | "conflict",
    message: string,
  ) {
    super(message)
    this.name = "RelabelRevertError"
  }
}

export const RELABEL_REVERT_EXPIRED_MESSAGE =
  "Relabels older than 30 days cannot be reverted."

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

export type RevertRelabelResult = {
  relabelId: number
  restoredRanges: number
  reinsertedRows: number
  /**
   * The prior label map row is active again. False when there was none, or
   * when another row is already active for the key (a later relabel keeps it).
   */
  mapRestored: boolean
}

export async function revertRelabel(
  relabelId: number,
  actorEmail: string,
  now: Date = new Date(),
  opts: { refuseSecondActive?: boolean } = {},
): Promise<RevertRelabelResult> {
  const email = String(actorEmail ?? "").trim()
  if (!email) throw new RelabelRevertError("invalid", "actorEmail is required.")

  const row = await getRelabel(relabelId)
  if (!row) throw new RelabelRevertError("not_found", `Relabel ${relabelId} was not found.`)
  if (row.status === "reverted") {
    throw new RelabelRevertError("already_reverted", `Relabel ${relabelId} is already reverted.`)
  }
  if (row.status === "blocked") {
    throw new RelabelRevertError("invalid", `Relabel ${relabelId} is blocked and cannot be reverted.`)
  }
  if (!canRevertRelabel(row.createdAt, now)) {
    throw new RelabelRevertError("expired", RELABEL_REVERT_EXPIRED_MESSAGE)
  }

  const plan = revertPlanFromPayload(row.beforeState)
  const route = factRouteForChannel(row.channel)
  const hasFallback = Boolean(route.fallbackKey)
  const entityBinds = hasFallback
    ? [row.platformEntityId, row.platformEntityId]
    : [row.platformEntityId]

  const refuseSecondActive = opts.refuseSecondActive ?? (await readRelabelMapOneActiveGuard())

  const map = await withSnowflakeSession(async (session) => {
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

      const reactivate = plan.reactivateMap
      const mapResult = await restorePriorLabelMapRow(
        labelMapSqlForSession(session),
        {
          deactivate: plan.deactivateMap,
          prior: reactivate
            ? {
                channel: reactivate.channel,
                platformEntityId: reactivate.platformLineItemId,
                lineItemId: normalizeLineItemId(reactivate.lineItemId),
                lineItemName: reactivate.lineItemName,
                mbaNumber: reactivate.mbaNumber,
                notes: `${reactivate.notes ? `${reactivate.notes} | ` : ""}restored by revert of relabel ${relabelId} | ${email} | ${now.toISOString()}`,
              }
            : null,
        },
        { refuseSecondActive },
      )
      if (mapResult.skipped === "another_active_row") {
        console.warn(
          JSON.stringify({
            event: "relabel_revert_map_kept",
            relabelId,
            channel: plan.deactivateMap.channel,
            platformEntityId: plan.deactivateMap.platformEntityId,
            activeRows: mapResult.activeRows,
          }),
        )
      }

      await sessionExecuteVoid(session, "COMMIT")
      return mapResult
    } catch (err) {
      await sessionExecuteVoid(session, "ROLLBACK").catch(() => {})
      if (err instanceof LabelMapSecondActiveRowError) {
        throw new RelabelRevertError("conflict", err.message)
      }
      throw err
    }
  })

  await markRelabelReverted(relabelId, email, plan)

  return {
    relabelId,
    restoredRanges: plan.restoreRanges.length,
    reinsertedRows: plan.reinsertDeletedRows.length,
    mapRestored: map.restored,
  }
}
