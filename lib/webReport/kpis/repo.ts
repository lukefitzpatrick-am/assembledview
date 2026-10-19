import "server-only"

import { and, asc, eq, inArray, sql } from "drizzle-orm"

import { getDb } from "@/db"
import { migrationMarkers, webKpiTargets, webKpis } from "@/db/schema"
import { roundMoney2 } from "@/lib/money/cents"

import {
  validateKpiInput,
  validateTargets,
  type WebKpi,
  type WebKpiInput,
  type WebKpiMetric,
  type WebKpiSource,
  type WebKpiTarget,
} from "./types"

export const MIGRATION_0101_KEY = "0101_web_kpis"

export class KpiMigrationError extends Error {
  constructor() {
    super("Web KPIs need migration 0101")
    this.name = "KpiMigrationError"
  }
}

export class KpiNotFoundError extends Error {
  constructor() {
    super("KPI not found for this client")
    this.name = "KpiNotFoundError"
  }
}

export async function migration0101Applied(): Promise<boolean> {
  try {
    const [row] = await getDb()
      .select({ key: migrationMarkers.key })
      .from(migrationMarkers)
      .where(eq(migrationMarkers.key, MIGRATION_0101_KEY))
      .limit(1)
    return Boolean(row)
  } catch (err) {
    console.warn("[web-kpis] could not read migration_markers", err)
    return false
  }
}

async function requireMigration(): Promise<void> {
  if (!(await migration0101Applied())) throw new KpiMigrationError()
}

type KpiRow = typeof webKpis.$inferSelect

function toKpi(row: KpiRow, targets: WebKpiTarget[]): WebKpi {
  return {
    id: row.id,
    clientId: row.clientId,
    label: row.label,
    source: row.source as WebKpiSource,
    eventNames: row.eventNames ?? null,
    metric: (row.metric as WebKpiMetric | null) ?? null,
    active: row.active,
    sortOrder: row.sortOrder,
    targets,
  }
}

async function targetsFor(kpiIds: string[]): Promise<Map<string, WebKpiTarget[]>> {
  const out = new Map<string, WebKpiTarget[]>()
  if (kpiIds.length === 0) return out
  const rows = await getDb()
    .select({ kpiId: webKpiTargets.kpiId, month: webKpiTargets.month, target: webKpiTargets.target })
    .from(webKpiTargets)
    .where(inArray(webKpiTargets.kpiId, kpiIds))
    .orderBy(asc(webKpiTargets.month))
  for (const row of rows) {
    const list = out.get(row.kpiId) ?? []
    list.push({ month: row.month, target: Number(row.target) })
    out.set(row.kpiId, list)
  }
  return out
}

/**
 * A client's KPIs with their monthly targets, active first, then sort order.
 * Empty until 0101 is applied. Pass includeInactive for the editor.
 */
export async function listKpis(clientId: number, options: { includeInactive?: boolean } = {}): Promise<WebKpi[]> {
  if (!(await migration0101Applied())) return []
  const where = options.includeInactive
    ? eq(webKpis.clientId, clientId)
    : and(eq(webKpis.clientId, clientId), eq(webKpis.active, true))
  const rows = await getDb()
    .select()
    .from(webKpis)
    .where(where)
    .orderBy(sql`${webKpis.active} DESC`, asc(webKpis.sortOrder), asc(webKpis.createdAt))
  const targets = await targetsFor(rows.map((row) => row.id))
  return rows.map((row) => toKpi(row, targets.get(row.id) ?? []))
}

/** Insert, or update when input.id is set. An update only touches a KPI of the same client. */
export async function upsertKpi(input: WebKpiInput, actor: string): Promise<WebKpi> {
  await requireMigration()
  const clean = validateKpiInput(input)
  const db = getDb()
  const now = new Date().toISOString()
  const fields = {
    label: clean.label,
    source: clean.source,
    eventNames: clean.eventNames,
    metric: clean.metric,
    sortOrder: clean.sortOrder,
    updatedAt: now,
    updatedBy: actor,
  }
  if (clean.id) {
    const [row] = await db
      .update(webKpis)
      .set(fields)
      .where(and(eq(webKpis.id, clean.id), eq(webKpis.clientId, clean.clientId)))
      .returning()
    if (!row) throw new KpiNotFoundError()
    const targets = await targetsFor([row.id])
    return toKpi(row, targets.get(row.id) ?? [])
  }
  const [row] = await db
    .insert(webKpis)
    .values({ ...fields, clientId: clean.clientId, active: true, createdBy: actor })
    .returning()
  return toKpi(row, [])
}

async function kpiBelongsTo(kpiId: string, clientId: number): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: webKpis.id })
    .from(webKpis)
    .where(and(eq(webKpis.id, kpiId), eq(webKpis.clientId, clientId)))
    .limit(1)
  return Boolean(row)
}

/**
 * Upserts the listed months for one of the client's KPIs. Months not listed
 * are left as they are. Targets are stored to 2 decimals (numeric(14,2)).
 */
export async function setTargets(
  kpiId: string,
  clientId: number,
  targets: WebKpiTarget[],
  actor: string,
): Promise<WebKpiTarget[]> {
  await requireMigration()
  const clean = validateTargets(targets)
  if (!(await kpiBelongsTo(kpiId, clientId))) throw new KpiNotFoundError()
  if (clean.length === 0) return []
  const now = new Date().toISOString()
  const values = clean.map((item) => ({
    kpiId,
    month: item.month,
    target: String(roundMoney2(item.target)),
    updatedAt: now,
    updatedBy: actor,
  }))
  await getDb()
    .insert(webKpiTargets)
    .values(values)
    .onConflictDoUpdate({
      target: [webKpiTargets.kpiId, webKpiTargets.month],
      set: {
        target: sql`excluded.target`,
        updatedAt: sql`excluded.updated_at`,
        updatedBy: sql`excluded.updated_by`,
      },
    })
  return clean.map((item) => ({ month: item.month, target: roundMoney2(item.target) }))
}

/** Deactivated KPIs keep their targets and drop out of actuals and the report. */
export async function deactivateKpi(kpiId: string, clientId: number, actor: string): Promise<boolean> {
  await requireMigration()
  const rows = await getDb()
    .update(webKpis)
    .set({ active: false, updatedAt: new Date().toISOString(), updatedBy: actor })
    .where(and(eq(webKpis.id, kpiId), eq(webKpis.clientId, clientId)))
    .returning({ id: webKpis.id })
  return rows.length > 0
}
