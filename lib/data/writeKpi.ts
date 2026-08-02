/**
 * Postgres-authoritative campaign_kpi / client_kpi writes (X5 / C-18 close).
 * Order: PG mutate → best-effort Xano mirror (failure → app_notifications).
 * Percent fields stored as decimal (AV-25 / percentUnits) — no magnitude heuristic.
 */
import "server-only"

import { eq, sql } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { xanoPostHeaderRecord, xanoUrl, getXanoTimeoutMs } from "@/lib/api/xano"
import {
  fetchCampaignKpisFromPostgres,
  mapKpiRowFromPostgres,
} from "@/lib/data/readKpi"
import type {
  CampaignKPI,
  CampaignKpiInput,
  ClientKpi,
  ClientKpiInput,
} from "@/lib/kpi/types"

export const KPI_MIRROR_FAILURE_KIND = "xano_kpi_mirror_failed"
export const KPI_MIRROR_FAILURE_AUDIENCE = "admin"

const CAMPAIGN_WRITABLE: Record<string, keyof typeof schema.campaignKpi.$inferInsert> = {
  mp_client_name: "mpClientName",
  mba_number: "mbaNumber",
  version_number: "versionNumber",
  campaign_name: "campaignName",
  media_type: "mediaType",
  publisher: "publisher",
  bid_strategy: "bidStrategy",
  ctr: "ctr",
  cpv: "cpv",
  conversion_rate: "conversionRate",
  vtr: "vtr",
  frequency: "frequency",
  line_item_id: "lineItemId",
}

const CLIENT_WRITABLE: Record<string, keyof typeof schema.clientKpi.$inferInsert> = {
  mp_client_name: "mpClientName",
  publisher_name: "publisherName",
  media_type: "mediaType",
  bid_strategy: "bidStrategy",
  ctr: "ctr",
  cpv: "cpv",
  conversion_rate: "conversionRate",
  vtr: "vtr",
  frequency: "frequency",
}

const PERCENT_KEYS = new Set(["ctr", "vtr", "conversion_rate"])

export type KpiMirrorFailurePayload = {
  op: "create" | "update" | "delete" | "sync"
  table: "campaign_kpi" | "client_kpi"
  rowId: number | null
  error: string
  timestamp: string
  retried: boolean
}

export function buildKpiMirrorFailurePayload(input: {
  op: KpiMirrorFailurePayload["op"]
  table: KpiMirrorFailurePayload["table"]
  rowId: number | null
  error: string
  at?: Date
}): KpiMirrorFailurePayload {
  return {
    op: input.op,
    table: input.table,
    rowId: input.rowId,
    error: input.error,
    timestamp: (input.at ?? new Date()).toISOString(),
    retried: false,
  }
}

/** Reject banned magnitude heuristics; pass decimal ≤1 or null through. */
export function assertKpiPercentDecimal(
  key: string,
  value: unknown
): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid ${key}: not a finite number`)
  }
  if (PERCENT_KEYS.has(key) && n > 1) {
    throw new Error(
      `Invalid ${key}: expected stored decimal ≤1 (got ${n}). Convert via percentUnits — magnitude heuristics are banned.`
    )
  }
  return n
}

function normalizeCampaignSnake(
  input: Partial<CampaignKpiInput>
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (!(key in CAMPAIGN_WRITABLE)) continue
    if (value === undefined) continue
    if (PERCENT_KEYS.has(key)) {
      out[key] = assertKpiPercentDecimal(key, value)
    } else {
      out[key] = value
    }
  }
  return out
}

function normalizeClientSnake(
  input: Partial<ClientKpiInput>
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (!(key in CLIENT_WRITABLE)) continue
    if (value === undefined) continue
    if (PERCENT_KEYS.has(key)) {
      out[key] = assertKpiPercentDecimal(key, value)
    } else {
      out[key] = value
    }
  }
  return out
}

function campaignSnakeToInsert(
  snake: Record<string, unknown>
): typeof schema.campaignKpi.$inferInsert {
  const values: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(snake)) {
    const camel = CAMPAIGN_WRITABLE[k]
    if (!camel) continue
    if (v === null) {
      values[camel] = null
      continue
    }
    if (
      camel === "ctr" ||
      camel === "cpv" ||
      camel === "conversionRate" ||
      camel === "vtr" ||
      camel === "frequency"
    ) {
      values[camel] = String(v)
    } else {
      values[camel] = v
    }
  }
  return values as typeof schema.campaignKpi.$inferInsert
}

function clientSnakeToInsert(
  snake: Record<string, unknown>
): typeof schema.clientKpi.$inferInsert {
  const values: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(snake)) {
    const camel = CLIENT_WRITABLE[k]
    if (!camel) continue
    if (v === null) {
      values[camel] = null
      continue
    }
    if (
      camel === "ctr" ||
      camel === "cpv" ||
      camel === "conversionRate" ||
      camel === "vtr" ||
      camel === "frequency"
    ) {
      values[camel] = String(v)
    } else {
      values[camel] = v
    }
  }
  return values as typeof schema.clientKpi.$inferInsert
}

function asCampaignRow(row: Record<string, unknown>): CampaignKPI {
  return mapKpiRowFromPostgres(row) as unknown as CampaignKPI
}

function asClientRow(row: Record<string, unknown>): ClientKpi {
  return mapKpiRowFromPostgres(row) as unknown as ClientKpi
}

async function persistKpiMirrorFailure(
  payload: KpiMirrorFailurePayload
): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) return
  try {
    const db = getDb()
    await db.execute(sql`
      INSERT INTO app_notifications (audience, kind, payload)
      VALUES (
        ${KPI_MIRROR_FAILURE_AUDIENCE},
        ${KPI_MIRROR_FAILURE_KIND},
        ${JSON.stringify(payload)}::jsonb
      )
    `)
  } catch (err) {
    console.warn("[kpi-mirror] failed to persist app_notifications row", {
      table: payload.table,
      rowId: payload.rowId,
      err,
    })
  }
}

async function mirrorKpiToXano(input: {
  op: "create" | "update" | "delete"
  table: "campaign_kpi" | "client_kpi"
  rowId: number | null
  body?: Record<string, unknown>
}): Promise<"ok" | "failed"> {
  const timeoutMs = getXanoTimeoutMs()
  const headers = {
    "Content-Type": "application/json",
    ...xanoPostHeaderRecord(),
  }
  const base = xanoUrl(input.table, "XANO_CLIENTS_BASE_URL")
  try {
    if (input.op === "create") {
      const res = await fetch(base, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...input.body, id: input.rowId }),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) {
        throw new Error(`Xano POST ${input.table} ${res.status}: ${await res.text().catch(() => "")}`)
      }
    } else if (input.op === "update") {
      if (input.rowId == null) throw new Error("update requires rowId")
      const res = await fetch(`${base}/${encodeURIComponent(String(input.rowId))}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(input.body ?? {}),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) {
        throw new Error(
          `Xano PATCH ${input.table}/${input.rowId} ${res.status}: ${await res.text().catch(() => "")}`
        )
      }
    } else {
      if (input.rowId == null) throw new Error("delete requires rowId")
      const res = await fetch(`${base}/${encodeURIComponent(String(input.rowId))}`, {
        method: "DELETE",
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) {
        throw new Error(
          `Xano DELETE ${input.table}/${input.rowId} ${res.status}: ${await res.text().catch(() => "")}`
        )
      }
    }
    return "ok"
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[kpi-mirror] Xano mirror failed", {
      op: input.op,
      table: input.table,
      rowId: input.rowId,
      message,
    })
    await persistKpiMirrorFailure(
      buildKpiMirrorFailurePayload({
        op: input.op,
        table: input.table,
        rowId: input.rowId,
        error: message,
      })
    )
    return "failed"
  }
}

export async function syncCampaignKpiIdSequence(): Promise<void> {
  await getDb().execute(sql`
    SELECT setval(
      pg_get_serial_sequence('campaign_kpi', 'id'),
      COALESCE((SELECT MAX(id) FROM campaign_kpi), 1),
      true
    )
  `)
}

export async function syncClientKpiIdSequence(): Promise<void> {
  await getDb().execute(sql`
    SELECT setval(
      pg_get_serial_sequence('client_kpi', 'id'),
      COALESCE((SELECT MAX(id) FROM client_kpi), 1),
      true
    )
  `)
}

export async function createCampaignKpisPostgresFirst(
  inputs: CampaignKpiInput[]
): Promise<CampaignKPI[]> {
  await syncCampaignKpiIdSequence()
  const db = getDb()
  const out: CampaignKPI[] = []
  for (let i = 0; i < inputs.length; i++) {
    const snake = normalizeCampaignSnake(inputs[i]!)
    try {
      const [inserted] = await db
        .insert(schema.campaignKpi)
        .values(campaignSnakeToInsert(snake))
        .returning()
      if (!inserted?.id) {
        throw new Error("insert returned no id")
      }
      const row = asCampaignRow(inserted as Record<string, unknown>)
      out.push(row)
      await mirrorKpiToXano({
        op: "create",
        table: "campaign_kpi",
        rowId: Number(inserted.id),
        body: snake,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(`createCampaignKpis: row ${i} failed: ${msg}`)
    }
  }
  return out
}

export async function updateCampaignKpiPostgresFirst(
  id: number,
  input: Partial<CampaignKpiInput>
): Promise<CampaignKPI | null> {
  const snake = normalizeCampaignSnake(input)
  if (Object.keys(snake).length === 0) {
    const [existing] = await getDb()
      .select()
      .from(schema.campaignKpi)
      .where(eq(schema.campaignKpi.id, id))
      .limit(1)
    return existing ? asCampaignRow(existing as Record<string, unknown>) : null
  }
  const [updated] = await getDb()
    .update(schema.campaignKpi)
    .set(campaignSnakeToInsert(snake))
    .where(eq(schema.campaignKpi.id, id))
    .returning()
  if (!updated) return null
  await mirrorKpiToXano({
    op: "update",
    table: "campaign_kpi",
    rowId: id,
    body: snake,
  })
  return asCampaignRow(updated as Record<string, unknown>)
}

export async function deleteCampaignKpiPostgresFirst(id: number): Promise<boolean> {
  const deleted = await getDb()
    .delete(schema.campaignKpi)
    .where(eq(schema.campaignKpi.id, id))
    .returning({ id: schema.campaignKpi.id })
  if (deleted.length === 0) return false
  await mirrorKpiToXano({ op: "delete", table: "campaign_kpi", rowId: id })
  return true
}

/**
 * Sync by natural key (mba, version, line_item_id) — PG authoritative read+write.
 */
export async function syncCampaignKpisPostgresFirst(
  inputs: CampaignKpiInput[]
): Promise<CampaignKPI[]> {
  if (inputs.length === 0) return []

  const existingByKey = new Map<string, CampaignKPI>()
  const existingRowsByPair = new Map<string, CampaignKPI[]>()
  const desiredLineIdsByPair = new Map<string, Set<string>>()
  const fetchedPairs = new Set<string>()
  const out: CampaignKPI[] = []

  for (let i = 0; i < inputs.length; i++) {
    const item = inputs[i]!
    const lineItemId = String(item.line_item_id ?? "").trim()
    if (!lineItemId) {
      console.warn("[syncCampaignKpis] Skipping row with empty line_item_id", {
        mba_number: item.mba_number,
        version_number: item.version_number,
      })
      continue
    }

    const pairKey = `${item.mba_number}|${item.version_number}`
    let desired = desiredLineIdsByPair.get(pairKey)
    if (!desired) {
      desired = new Set<string>()
      desiredLineIdsByPair.set(pairKey, desired)
    }
    desired.add(lineItemId.toLowerCase())

    if (!fetchedPairs.has(pairKey)) {
      // Always PG for sync pre-read — writes are PG-authoritative regardless of DATA_BACKEND_KPI.
      const existing = (await fetchCampaignKpisFromPostgres(
        item.mba_number,
        item.version_number
      )) as unknown as CampaignKPI[]
      existingRowsByPair.set(pairKey, existing)
      for (const row of existing) {
        const rowLineItemId = String(row.line_item_id ?? "").trim()
        if (!rowLineItemId) continue
        existingByKey.set(
          `${item.mba_number}|${item.version_number}|${rowLineItemId.toLowerCase()}`,
          row
        )
      }
      fetchedPairs.add(pairKey)
    }

    const naturalKey = `${item.mba_number}|${item.version_number}|${lineItemId.toLowerCase()}`
    const existing = existingByKey.get(naturalKey)

    try {
      if (existing && typeof existing.id === "number") {
        const patched = await updateCampaignKpiPostgresFirst(existing.id, item)
        if (patched === null) {
          throw new Error(`updateCampaignKpi returned null for id=${existing.id}`)
        }
        out.push(patched)
        existingByKey.set(naturalKey, patched)
      } else {
        const created = await createCampaignKpisPostgresFirst([item])
        const row = created[0]
        if (!row) throw new Error(`POST returned null for line_item_id=${lineItemId}`)
        out.push(row)
        existingByKey.set(naturalKey, row)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(
        `syncCampaignKpis: row ${i} (line_item_id=${lineItemId}) failed: ${msg}`
      )
    }
  }

  for (const [pairKey, desired] of desiredLineIdsByPair) {
    const existing = existingRowsByPair.get(pairKey) ?? []
    for (const row of existing) {
      const rowLineItemId = String(row.line_item_id ?? "").trim()
      const keep =
        rowLineItemId.length > 0 && desired.has(rowLineItemId.toLowerCase())
      if (keep) continue
      if (typeof row.id !== "number") continue
      const deleted = await deleteCampaignKpiPostgresFirst(row.id)
      if (!deleted) {
        console.warn("[syncCampaignKpis] Failed to delete orphan campaign_kpi row", {
          id: row.id,
          pairKey,
          line_item_id: rowLineItemId || null,
        })
      }
    }
  }

  return out
}

export async function createClientKpiPostgresFirst(
  input: ClientKpiInput
): Promise<ClientKpi | null> {
  try {
    await syncClientKpiIdSequence()
    const snake = normalizeClientSnake(input)
    const [inserted] = await getDb()
      .insert(schema.clientKpi)
      .values(clientSnakeToInsert(snake))
      .returning()
    if (!inserted?.id) return null
    await mirrorKpiToXano({
      op: "create",
      table: "client_kpi",
      rowId: Number(inserted.id),
      body: snake,
    })
    return asClientRow(inserted as Record<string, unknown>)
  } catch (e) {
    console.error("createClientKpi", e)
    return null
  }
}

export async function updateClientKpiPostgresFirst(
  id: number,
  input: Partial<ClientKpiInput>
): Promise<ClientKpi | null> {
  try {
    const snake = normalizeClientSnake(input)
    if (Object.keys(snake).length === 0) {
      const [existing] = await getDb()
        .select()
        .from(schema.clientKpi)
        .where(eq(schema.clientKpi.id, id))
        .limit(1)
      return existing ? asClientRow(existing as Record<string, unknown>) : null
    }
    const [updated] = await getDb()
      .update(schema.clientKpi)
      .set(clientSnakeToInsert(snake))
      .where(eq(schema.clientKpi.id, id))
      .returning()
    if (!updated) return null
    await mirrorKpiToXano({
      op: "update",
      table: "client_kpi",
      rowId: id,
      body: snake,
    })
    return asClientRow(updated as Record<string, unknown>)
  } catch (e) {
    console.error("updateClientKpi", e)
    return null
  }
}

export async function deleteClientKpiPostgresFirst(id: number): Promise<boolean> {
  try {
    const deleted = await getDb()
      .delete(schema.clientKpi)
      .where(eq(schema.clientKpi.id, id))
      .returning({ id: schema.clientKpi.id })
    if (deleted.length === 0) return false
    await mirrorKpiToXano({ op: "delete", table: "client_kpi", rowId: id })
    return true
  } catch (e) {
    console.error("deleteClientKpi", e)
    return false
  }
}
