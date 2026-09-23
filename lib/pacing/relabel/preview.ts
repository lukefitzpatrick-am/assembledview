import "server-only"

import {
  asIsoDate,
  cardChannelFromPlanLine,
  cardChannelFromWarehouse,
  isCm360Channel,
  normalizeLineItemId,
} from "./shared/channels"
import { buildMoveRowsSql, mbaFromLineItemId, resolveEntity } from "./entity"
import type {
  RelabelActiveMap,
  RelabelEntity,
  RelabelIssue,
  RelabelMoveGroup,
  RelabelMoveRow,
  RelabelPreview,
  RelabelPublishedLine,
  RelabelQueryFn,
} from "./shared/types"
import { RELABEL_DAYS_WARNING, RELABEL_SPEND_WARNING } from "./shared/types"

export type PreviewRelabelArgs = {
  channel: string
  platformEntityId: string
  lineItemId: string
  dateFrom?: string | null
  dateTo?: string | null
}

export type PreviewRelabelDeps = {
  resolveEntity?: typeof resolveEntity
  query?: RelabelQueryFn
  lookupPublishedLine: (lineItemId: string) => Promise<RelabelPublishedLine | null>
  lookupActiveLabelMap: (args: {
    channel: string
    platformEntityId: string
  }) => Promise<RelabelActiveMap | null>
  loadMoveRows?: (args: PreviewRelabelArgs, entity: RelabelEntity) => Promise<RelabelMoveRow[]>
}

export function detectCm360DoubleCount(
  rows: Array<{ date: string; lineItemName: string }>,
  entityName: string,
  planCode: string,
): string[] {
  const base = String(entityName ?? "").trim().toLowerCase()
  const renamed = `${base}-${String(planCode ?? "").trim().toLowerCase()}`
  if (!base || !planCode) return []

  const byDate = new Map<string, { oldName: boolean; renamed: boolean }>()
  for (const row of rows) {
    const date = asIsoDate(row.date)
    const name = String(row.lineItemName ?? "").trim().toLowerCase()
    const slot = byDate.get(date) ?? { oldName: false, renamed: false }
    if (name === base) slot.oldName = true
    if (name === renamed) slot.renamed = true
    byDate.set(date, slot)
  }

  return [...byDate.entries()]
    .filter(([, flags]) => flags.oldName && flags.renamed)
    .map(([date]) => date)
    .sort()
}

function groupMoves(rows: RelabelMoveRow[]): RelabelMoveGroup[] {
  const groups = new Map<string, RelabelMoveGroup>()
  for (const row of rows) {
    const key = normalizeLineItemId(row.lineItemId) || ""
    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, {
        previousLineItemId: key || null,
        dateFrom: row.date,
        dateTo: row.date,
        dayCount: 1,
        spend: row.spend,
        impressions: row.impressions,
        rows: 1,
      })
      continue
    }
    existing.dateFrom = row.date < existing.dateFrom ? row.date : existing.dateFrom
    existing.dateTo = row.date > existing.dateTo ? row.date : existing.dateTo
    existing.dayCount += 1
    existing.spend += row.spend
    existing.impressions += row.impressions
    existing.rows += 1
  }
  return [...groups.values()].sort((a, b) =>
    String(a.previousLineItemId ?? "").localeCompare(String(b.previousLineItemId ?? "")),
  )
}

async function defaultLoadMoveRows(
  args: PreviewRelabelArgs,
  entity: RelabelEntity,
  query: RelabelQueryFn,
): Promise<RelabelMoveRow[]> {
  const binds: unknown[] = [args.channel, args.platformEntityId]
  if (entity.route.fallbackKey) binds.push(args.platformEntityId)
  if (args.dateFrom) binds.push(args.dateFrom)
  if (args.dateTo) binds.push(args.dateTo)
  const rows = await query(
    buildMoveRowsSql(entity.route, { dateFrom: args.dateFrom, dateTo: args.dateTo }),
    binds,
  )
  return rows.map((row) => ({
    date: asIsoDate(row.DATE_DAY),
    lineItemId: normalizeLineItemId(row.LINE_ITEM_ID as string | null) || null,
    lineItemName: String(row.LINE_ITEM_NAME ?? "").trim(),
    spend: Number(row.AMOUNT_SPENT) || 0,
    impressions: Number(row.IMPRESSIONS) || 0,
    platformLineItemId: row.PLATFORM_LINE_ITEM_ID == null ? null : String(row.PLATFORM_LINE_ITEM_ID),
    clicks: Number(row.CLICKS) || 0,
    results: Number(row.RESULTS) || 0,
  }))
}

export async function previewRelabel(
  args: PreviewRelabelArgs,
  deps: PreviewRelabelDeps,
): Promise<RelabelPreview> {
  const channel = String(args.channel ?? "").trim()
  const platformEntityId = String(args.platformEntityId ?? "").trim()
  const lineItemId = normalizeLineItemId(args.lineItemId)
  const dateFrom = args.dateFrom ? asIsoDate(args.dateFrom) : null
  const dateTo = args.dateTo ? asIsoDate(args.dateTo) : null

  if (!deps.query && !deps.resolveEntity) {
    throw new Error("previewRelabel requires query or resolveEntity")
  }

  const entity = deps.resolveEntity
    ? await deps.resolveEntity({ channel, platformEntityId }, deps.query ?? (async () => []))
    : await resolveEntity({ channel, platformEntityId }, deps.query!)

  const publishedLine = await deps.lookupPublishedLine(lineItemId)
  const activeMap = await deps.lookupActiveLabelMap({ channel, platformEntityId })
  const moveRows = deps.loadMoveRows
    ? await deps.loadMoveRows({ ...args, channel, platformEntityId, lineItemId, dateFrom, dateTo }, entity)
    : deps.query
      ? await defaultLoadMoveRows({ ...args, channel, platformEntityId, dateFrom, dateTo }, entity, deps.query)
      : []

  const moves = groupMoves(moveRows)
  const spendMoving = moves.reduce((sum, group) => sum + group.spend, 0)
  const daysMoving = new Set(moveRows.map((row) => row.date)).size
  const rowsMoving = moveRows.length
  const noChange =
    lineItemId.length > 0 &&
    moveRows.length > 0 &&
    moveRows.every((row) => normalizeLineItemId(row.lineItemId) === lineItemId)

  const warnings: RelabelIssue[] = []
  const blocks: RelabelIssue[] = []

  if (!publishedLine || !publishedLine.published || !publishedLine.onPublishedVersion) {
    blocks.push({
      code: "target_not_published",
      message: `LINE_ITEM_ID '${lineItemId}' is not on a published MBA version.`,
    })
  }

  const targetCardChannel = publishedLine
    ? publishedLine.cardChannel ?? cardChannelFromPlanLine(publishedLine.lineChannel)
    : null
  const entityCard = entity.cardChannel ?? cardChannelFromWarehouse(channel)
  if (publishedLine && targetCardChannel && targetCardChannel !== entityCard) {
    blocks.push({
      code: "channel_mismatch",
      message: `Entity channel ${entityCard} does not match plan line channel ${targetCardChannel}.`,
    })
  }

  if (!noChange && spendMoving > RELABEL_SPEND_WARNING) {
    warnings.push({
      code: "spend_over_25000",
      message: `Spend moved (${spendMoving}) exceeds ${RELABEL_SPEND_WARNING}.`,
    })
  }
  if (!noChange && daysMoving > RELABEL_DAYS_WARNING) {
    warnings.push({
      code: "days_over_90",
      message: `Days moved (${daysMoving}) exceeds ${RELABEL_DAYS_WARNING}.`,
    })
  }

  const mappedTo = normalizeLineItemId(activeMap?.lineItemId)
  if (activeMap && mappedTo && mappedTo !== lineItemId) {
    warnings.push({
      code: "already_mapped",
      message: `An active LINE_ITEM_LABEL_MAP row already points this entity at '${mappedTo}'.`,
    })
  }

  const duplicateOldNameDays = isCm360Channel(channel)
    ? detectCm360DoubleCount(moveRows, entity.entityName, lineItemId)
    : []
  if (duplicateOldNameDays.length > 0) {
    blocks.push({
      code: "double_count",
      message: `CM360 rows exist for both '${entity.entityName}' and '${entity.entityName}-${lineItemId}' on ${duplicateOldNameDays.length} day(s).`,
    })
  }

  return {
    channel,
    platformEntityId,
    entityName: entity.entityName,
    lineItemId,
    mbaNumber: publishedLine?.mbaNumber ?? mbaFromLineItemId(lineItemId),
    dateFrom,
    dateTo,
    cardChannel: entityCard,
    targetCardChannel,
    moves,
    rowsMoving,
    spendMoving,
    daysMoving,
    warnings,
    blocks,
    state: noChange ? "no_change" : "apply",
    duplicateOldNameDays,
    activeMap,
    publishedLine,
  }
}
