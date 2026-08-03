import "server-only"

import { eq, sql } from "drizzle-orm"
import { getDb, schema } from "@/db"
import type {
  PlanningAudienceRow,
  PlanningAudienceWritable,
} from "./audienceTypes"

export type { PlanningAudienceRow, PlanningAudienceWritable } from "./audienceTypes"
export { resolveClientsIdByMbaIdentifier } from "./resolveClientsIdByMbaIdentifier"

type PlanningAudiencePgRow = typeof schema.planningAudiences.$inferSelect
type PlanningAudienceInsert = typeof schema.planningAudiences.$inferInsert

export class XanoPlanningAudienceError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "XanoPlanningAudienceError"
    this.status = status
  }
}

function mapDbError(error: unknown, context: string): never {
  if (error instanceof XanoPlanningAudienceError) {
    throw error
  }
  console.error(`[planning-audiences] ${context}`, error)
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes("DATABASE_URL")) {
    throw new XanoPlanningAudienceError("DATABASE_URL is not set", 500)
  }
  throw new XanoPlanningAudienceError(`${context} failed`, 502)
}

function toUnixMs(value: string | null | undefined): number {
  if (!value) return 0
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : 0
}

function numOrZero(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function rowToApi(row: PlanningAudiencePgRow): PlanningAudienceRow {
  return {
    id: row.id,
    created_at: toUnixMs(row.createdAt),
    clients_id: row.clientsId ?? 0,
    mba_number: row.mbaNumber ?? null,
    name: row.name ?? "",
    definition_json: row.definitionJson ?? null,
    composed_wc: numOrZero(row.composedWc),
    client_visible: Boolean(row.clientVisible),
    created_by_email: row.createdByEmail ?? "",
  }
}

function writableToInsert(body: PlanningAudienceWritable): PlanningAudienceInsert {
  return {
    clientsId: body.clients_id,
    mbaNumber: body.mba_number ?? null,
    name: body.name,
    definitionJson: body.definition_json ?? null,
    composedWc: String(body.composed_wc),
    clientVisible: body.client_visible ?? false,
    createdByEmail: body.created_by_email,
  }
}

export async function listPlanningAudiences(opts?: {
  clientsId?: number
}): Promise<PlanningAudienceRow[]> {
  try {
    const db = getDb()
    if (opts?.clientsId == null) {
      const rows = await db.select().from(schema.planningAudiences)
      return rows.map(rowToApi)
    }
    const rows = await db
      .select()
      .from(schema.planningAudiences)
      .where(eq(schema.planningAudiences.clientsId, opts.clientsId))
    return rows.map(rowToApi)
  } catch (error) {
    mapDbError(error, "listPlanningAudiences")
  }
}

export async function createPlanningAudience(
  body: PlanningAudienceWritable
): Promise<PlanningAudienceRow> {
  try {
    const db = getDb()
    const [row] = await db
      .insert(schema.planningAudiences)
      .values(writableToInsert(body))
      .returning()
    if (!row) {
      throw new XanoPlanningAudienceError("create failed: no row returned", 502)
    }
    return rowToApi(row)
  } catch (error) {
    mapDbError(error, "createPlanningAudience")
  }
}

export async function getPlanningAudience(id: number): Promise<PlanningAudienceRow> {
  try {
    const db = getDb()
    const [row] = await db
      .select()
      .from(schema.planningAudiences)
      .where(eq(schema.planningAudiences.id, id))
      .limit(1)
    if (!row) {
      throw new XanoPlanningAudienceError("Audience not found", 404)
    }
    return rowToApi(row)
  } catch (error) {
    mapDbError(error, "getPlanningAudience")
  }
}

export async function updatePlanningAudience(
  id: number,
  patch: {
    mba_number?: string | null
    client_visible?: boolean
    name?: string
  }
): Promise<PlanningAudienceRow> {
  try {
    const db = getDb()
    const set: Partial<PlanningAudienceInsert> = {}
    if (patch.mba_number !== undefined) set.mbaNumber = patch.mba_number
    if (patch.client_visible !== undefined) set.clientVisible = patch.client_visible
    if (patch.name !== undefined) set.name = patch.name

    const [row] = await db
      .update(schema.planningAudiences)
      .set(set)
      .where(eq(schema.planningAudiences.id, id))
      .returning()
    if (!row) {
      throw new XanoPlanningAudienceError("Audience not found", 404)
    }
    return rowToApi(row)
  } catch (error) {
    mapDbError(error, "updatePlanningAudience")
  }
}

export async function listPlanningAudiencesByMba(
  mbaNumber: string
): Promise<PlanningAudienceRow[]> {
  const needle = mbaNumber.trim().toLowerCase()
  if (!needle) return []
  try {
    const db = getDb()
    const rows = await db
      .select()
      .from(schema.planningAudiences)
      .where(sql`lower(${schema.planningAudiences.mbaNumber}) = ${needle}`)
    return rows.map(rowToApi)
  } catch (error) {
    mapDbError(error, "listPlanningAudiencesByMba")
  }
}
