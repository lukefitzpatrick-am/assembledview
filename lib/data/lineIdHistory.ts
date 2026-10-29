/**
 * Line id history for one plan (every version of the master). Feeds the
 * never-reuse rule: the editor floor on load (`line_id_floors`), the ingest
 * stamp floor, and the save-time check inside `savePlanVersion`.
 */

import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { getDb, schema } from "@/db"
import {
  computeLineIdFloors,
  type LineIdFloors,
} from "@/lib/mediaplan/lineItemIds"
import type {
  LineIdHistoryRow,
  LineIdHistoryVersion,
} from "@/lib/mediaplan/retiredLineIds"

type Schema = typeof schema
type Reader = PostgresJsDatabase<Schema>

export type MasterLineIdHistory = {
  versions: LineIdHistoryVersion[]
  rows: LineIdHistoryRow[]
}

/** Every version of the master and every line id on it. Read only. */
export async function loadMasterLineIdHistory(
  db: Reader,
  masterId: number,
): Promise<MasterLineIdHistory> {
  const versionRows = await db
    .select({
      id: schema.mediaPlanVersions.id,
      versionNumber: schema.mediaPlanVersions.versionNumber,
    })
    .from(schema.mediaPlanVersions)
    .where(eq(schema.mediaPlanVersions.masterId, masterId))

  const lineRows = await db
    .select({
      versionId: schema.lineItems.versionId,
      lineItemId: schema.lineItems.lineItemId,
    })
    .from(schema.lineItems)
    .innerJoin(
      schema.mediaPlanVersions,
      eq(schema.mediaPlanVersions.id, schema.lineItems.versionId),
    )
    .where(eq(schema.mediaPlanVersions.masterId, masterId))

  return {
    versions: versionRows.map((v) => ({
      versionId: Number(v.id),
      versionNumber: Number(v.versionNumber),
    })),
    rows: lineRows.map((r) => ({
      versionId: Number(r.versionId),
      lineItemId: String(r.lineItemId ?? ""),
    })),
  }
}

/** Per media code, the highest line number any version of the plan used. */
export async function loadLineIdFloorsForMaster(
  masterId: number,
  mbaNumber: string,
  db: Reader = getDb() as unknown as Reader,
): Promise<LineIdFloors> {
  const history = await loadMasterLineIdHistory(db, masterId)
  return computeLineIdFloors(
    mbaNumber,
    history.rows.map((r) => r.lineItemId),
  )
}
