import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm"

import { getDb, schema } from "@/db"
import type { DeliveryRelabelRow, RelabelBeforeState, RelabelRevertPlan } from "./types"
import { RelabelRepoError, isMissingRelabelTable, relabelUnavailable } from "./repoErrors"

export { RelabelRepoError, isMissingRelabelTable }
export type { DeliveryRelabelRow }

export type DeliveryRelabelLogAction = "preview" | "apply" | "warn_ack" | "block" | "revert"

export type DeliveryRelabelLogRow = {
  id: number
  relabelId: number | null
  action: DeliveryRelabelLogAction
  actorEmail: string
  payload: Record<string, unknown>
  createdAt: string
  mbaNumber: string | null
  entityName: string | null
  toLineItemId: string | null
}

export type ListRelabelsFilters = {
  mba?: string
  status?: string
  actor?: string
  from?: string
  to?: string
}

export type InsertRelabelApplyArgs = {
  channel: string
  platformEntityId: string
  entityName: string
  fromLineItemId: string | null
  toLineItemId: string
  mbaNumber: string
  dateFrom: string | null
  dateTo: string | null
  reason: string
  actorEmail: string
  beforeState: RelabelBeforeState
  applyResult: Record<string, unknown>
}

function mapRow(row: {
  id: number
  channel: string
  platformEntityId: string
  entityName: string | null
  fromLineItemId: string | null
  toLineItemId: string
  mbaNumber: string
  dateFrom: string | null
  dateTo: string | null
  reason: string
  actorEmail: string
  status: string
  beforeState: unknown
  applyResult: unknown
  createdAt: string
  revertedAt: string | null
  revertedByEmail: string | null
}): DeliveryRelabelRow {
  return {
    id: Number(row.id),
    channel: row.channel,
    platformEntityId: row.platformEntityId,
    entityName: row.entityName,
    fromLineItemId: row.fromLineItemId,
    toLineItemId: row.toLineItemId,
    mbaNumber: row.mbaNumber,
    dateFrom: row.dateFrom,
    dateTo: row.dateTo,
    reason: row.reason,
    actorEmail: row.actorEmail,
    status:
      row.status === "reverted" ? "reverted" : row.status === "blocked" ? "blocked" : "applied",
    beforeState: row.beforeState as RelabelBeforeState,
    applyResult: (row.applyResult as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt,
    revertedAt: row.revertedAt,
    revertedByEmail: row.revertedByEmail,
  }
}

function wrapMissing<T>(work: () => Promise<T>): Promise<T> {
  return work().catch((err) => {
    if (isMissingRelabelTable(err)) relabelUnavailable()
    throw err
  })
}

/** Fail-soft ping. list/preview callers use this; do not SELECT before 0085 is applied. */
export async function assertRelabelTablesAvailable(): Promise<void> {
  await wrapMissing(async () => {
    const db = getDb()
    await db.select({ id: schema.deliveryRelabels.id }).from(schema.deliveryRelabels).limit(1)
  })
}

export async function listRelabels(filters: ListRelabelsFilters = {}): Promise<DeliveryRelabelRow[]> {
  return wrapMissing(async () => {
    const db = getDb()
    const conds: SQL[] = []
    const mba = filters.mba?.trim().toLowerCase() ?? ""
    if (mba) conds.push(eq(schema.deliveryRelabels.mbaNumber, mba))
    const status = filters.status?.trim().toLowerCase() ?? ""
    if (status) conds.push(eq(schema.deliveryRelabels.status, status))
    const actor = filters.actor?.trim().toLowerCase() ?? ""
    if (actor) conds.push(sql`lower(${schema.deliveryRelabels.actorEmail}) = ${actor}`)
    if (filters.from) {
      conds.push(sql`${schema.deliveryRelabels.createdAt}::date >= ${filters.from}::date`)
    }
    if (filters.to) {
      conds.push(sql`${schema.deliveryRelabels.createdAt}::date <= ${filters.to}::date`)
    }
    const rows = await db
      .select()
      .from(schema.deliveryRelabels)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(schema.deliveryRelabels.createdAt))
    return rows.map(mapRow)
  })
}

export async function getRelabel(id: number): Promise<DeliveryRelabelRow | null> {
  return wrapMissing(async () => {
    const db = getDb()
    const rows = await db
      .select()
      .from(schema.deliveryRelabels)
      .where(eq(schema.deliveryRelabels.id, id))
      .limit(1)
    return rows[0] ? mapRow(rows[0]) : null
  })
}

export async function insertRelabelApply(args: InsertRelabelApplyArgs): Promise<DeliveryRelabelRow> {
  return wrapMissing(async () => {
    const db = getDb()
    const inserted = await db
      .insert(schema.deliveryRelabels)
      .values({
        channel: args.channel,
        platformEntityId: args.platformEntityId,
        entityName: args.entityName,
        fromLineItemId: args.fromLineItemId,
        toLineItemId: args.toLineItemId,
        mbaNumber: args.mbaNumber,
        dateFrom: args.dateFrom,
        dateTo: args.dateTo,
        reason: args.reason,
        actorEmail: args.actorEmail,
        status: "applied",
        beforeState: args.beforeState,
        applyResult: args.applyResult,
      })
      .returning()
    const row = inserted[0]
    if (!row) throw new RelabelRepoError("VALIDATION", "insert returned no row")
    await db.insert(schema.deliveryRelabelLog).values({
      relabelId: row.id,
      action: "apply",
      actorEmail: args.actorEmail,
      payload: args.beforeState,
    })
    return mapRow(row)
  })
}

export async function markRelabelReverted(
  relabelId: number,
  actorEmail: string,
  payload: RelabelRevertPlan,
): Promise<void> {
  await wrapMissing(async () => {
    const db = getDb()
    await db
      .update(schema.deliveryRelabels)
      .set({
        status: "reverted",
        revertedAt: new Date().toISOString(),
        revertedByEmail: actorEmail,
      })
      .where(eq(schema.deliveryRelabels.id, relabelId))
    await db.insert(schema.deliveryRelabelLog).values({
      relabelId,
      action: "revert",
      actorEmail,
      payload,
    })
  })
}

export async function insertLog(args: {
  relabelId?: number | null
  action: DeliveryRelabelLogAction
  actorEmail: string
  payload: Record<string, unknown>
}): Promise<void> {
  await wrapMissing(async () => {
    const db = getDb()
    await db.insert(schema.deliveryRelabelLog).values({
      relabelId: args.relabelId ?? null,
      action: args.action,
      actorEmail: args.actorEmail,
      payload: args.payload,
    })
  })
}

export async function insertBlocked(args: InsertRelabelApplyArgs): Promise<DeliveryRelabelRow> {
  return wrapMissing(async () => {
    const db = getDb()
    const inserted = await db
      .insert(schema.deliveryRelabels)
      .values({
        channel: args.channel,
        platformEntityId: args.platformEntityId,
        entityName: args.entityName,
        fromLineItemId: args.fromLineItemId,
        toLineItemId: args.toLineItemId,
        mbaNumber: args.mbaNumber,
        dateFrom: args.dateFrom,
        dateTo: args.dateTo,
        reason: args.reason,
        actorEmail: args.actorEmail,
        status: "blocked",
        beforeState: args.beforeState,
        applyResult: args.applyResult,
      })
      .returning()
    const row = inserted[0]
    if (!row) throw new RelabelRepoError("VALIDATION", "insert returned no row")
    await db.insert(schema.deliveryRelabelLog).values({
      relabelId: row.id,
      action: "block",
      actorEmail: args.actorEmail,
      payload: args.applyResult,
    })
    return mapRow(row)
  })
}

export async function listRelabelLogForDay(dayYmd: string): Promise<DeliveryRelabelLogRow[]> {
  return wrapMissing(async () => {
    const db = getDb()
    const rows = await db
      .select({
        id: schema.deliveryRelabelLog.id,
        relabelId: schema.deliveryRelabelLog.relabelId,
        action: schema.deliveryRelabelLog.action,
        actorEmail: schema.deliveryRelabelLog.actorEmail,
        payload: schema.deliveryRelabelLog.payload,
        createdAt: schema.deliveryRelabelLog.createdAt,
        mbaNumber: schema.deliveryRelabels.mbaNumber,
        entityName: schema.deliveryRelabels.entityName,
        toLineItemId: schema.deliveryRelabels.toLineItemId,
      })
      .from(schema.deliveryRelabelLog)
      .leftJoin(
        schema.deliveryRelabels,
        eq(schema.deliveryRelabelLog.relabelId, schema.deliveryRelabels.id),
      )
      .where(
        and(
          inArray(schema.deliveryRelabelLog.action, ["apply", "revert", "block"]),
          sql`${schema.deliveryRelabelLog.createdAt}::date = ${dayYmd}::date`,
        ),
      )
      .orderBy(desc(schema.deliveryRelabelLog.createdAt))
    return rows.map((row) => ({
      id: Number(row.id),
      relabelId: row.relabelId == null ? null : Number(row.relabelId),
      action: row.action as DeliveryRelabelLogAction,
      actorEmail: row.actorEmail,
      payload: (row.payload as Record<string, unknown>) ?? {},
      createdAt: row.createdAt,
      mbaNumber: row.mbaNumber ?? null,
      entityName: row.entityName ?? null,
      toLineItemId: row.toLineItemId ?? null,
    }))
  })
}
