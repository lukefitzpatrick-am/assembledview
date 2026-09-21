import { desc, eq } from "drizzle-orm"

import { getDb, schema } from "@/db"
import type { RelabelBeforeState, RelabelRevertPlan } from "./types"
import { RelabelRepoError, isMissingRelabelTable, relabelUnavailable } from "./repoErrors"

export { RelabelRepoError, isMissingRelabelTable }

export type DeliveryRelabelRow = {
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
  status: "applied" | "reverted"
  beforeState: RelabelBeforeState
  applyResult: Record<string, unknown> | null
  createdAt: string
  revertedAt: string | null
  revertedByEmail: string | null
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
    status: row.status === "reverted" ? "reverted" : "applied",
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

export async function listRelabels(mbaNumber: string): Promise<DeliveryRelabelRow[]> {
  const mba = mbaNumber.trim().toLowerCase()
  if (!mba) return []
  return wrapMissing(async () => {
    const db = getDb()
    const rows = await db
      .select()
      .from(schema.deliveryRelabels)
      .where(eq(schema.deliveryRelabels.mbaNumber, mba))
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
