import "server-only"

import { and, eq, sql } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { coerceNumericStringsToNumbers, toApiRow } from "@/lib/data/toApiRow"
import type { CampaignKPI, ClientKpi, PublisherKpi } from "@/lib/kpi/types"

/** Minimal MBA/version pair for bulk campaign_kpi loads (pacing). */
export type KpiMbaVersionPair = {
  mbaNumber: string
  versionNumber: number
}

export function mapKpiRowFromPostgres(
  row: Record<string, unknown>
): Record<string, unknown> {
  return coerceNumericStringsToNumbers(toApiRow(row))
}

// --- campaign_kpi ---

export async function fetchCampaignKpisFromPostgres(
  mbaNumber: string,
  versionNumber: number
): Promise<Record<string, unknown>[]> {
  const db = getDb()
  const rows = await db
    .select()
    .from(schema.campaignKpi)
    .where(
      and(
        sql`lower(${schema.campaignKpi.mbaNumber}) = lower(${mbaNumber})`,
        eq(schema.campaignKpi.versionNumber, versionNumber)
      )
    )
  return rows.map((row) => mapKpiRowFromPostgres(row as Record<string, unknown>))
}

/** campaign_kpi list for one (mba, version). Postgres. */
export async function readCampaignKpis(
  mbaNumber: string,
  versionNumber: number
): Promise<CampaignKPI[]> {
  return (await fetchCampaignKpisFromPostgres(
    mbaNumber,
    versionNumber
  )) as unknown as CampaignKPI[]
}

export async function fetchCampaignKpisForMbasFromPostgres(
  pairs: KpiMbaVersionPair[]
): Promise<Record<string, unknown>[]> {
  if (pairs.length === 0) return []

  const uniqueKeys = new Set<string>()
  const uniquePairs: KpiMbaVersionPair[] = []
  for (const pair of pairs) {
    const key = `${pair.mbaNumber}|${pair.versionNumber}`
    if (uniqueKeys.has(key)) continue
    uniqueKeys.add(key)
    uniquePairs.push(pair)
  }

  const out: Record<string, unknown>[] = []
  for (const { mbaNumber, versionNumber } of uniquePairs) {
    const rows = await fetchCampaignKpisFromPostgres(mbaNumber, versionNumber)
    out.push(...rows)
  }
  return out
}

export async function readCampaignKpisForMbas(
  pairs: KpiMbaVersionPair[]
): Promise<Record<string, unknown>[]> {
  return fetchCampaignKpisForMbasFromPostgres(pairs)
}

// --- client_kpi ---

export async function fetchClientKpisFromPostgres(
  clientName: string
): Promise<Record<string, unknown>[]> {
  const db = getDb()
  const rows = await db
    .select()
    .from(schema.clientKpi)
    .where(eq(schema.clientKpi.mpClientName, clientName))
  return rows.map((row) => mapKpiRowFromPostgres(row as Record<string, unknown>))
}

export async function readClientKpis(clientName: string): Promise<ClientKpi[]> {
  return (await fetchClientKpisFromPostgres(clientName)) as unknown as ClientKpi[]
}

// --- publisher_kpi ---

export async function fetchAllPublisherKpisFromPostgres(): Promise<
  Record<string, unknown>[]
> {
  const db = getDb()
  const rows = await db.select().from(schema.publisherKpi)
  return rows.map((row) => mapKpiRowFromPostgres(row as Record<string, unknown>))
}

export async function fetchPublisherKpisFromPostgres(
  publisherKey: string
): Promise<Record<string, unknown>[]> {
  const key = publisherKey.trim()
  const db = getDb()
  const rows = await db
    .select()
    .from(schema.publisherKpi)
    .where(eq(schema.publisherKpi.publisher, key))
  return rows.map((row) => mapKpiRowFromPostgres(row as Record<string, unknown>))
}

export async function readAllPublisherKpis(): Promise<PublisherKpi[]> {
  return (await fetchAllPublisherKpisFromPostgres()) as unknown as PublisherKpi[]
}

export async function readPublisherKpis(
  publisherKey: string
): Promise<PublisherKpi[]> {
  return (await fetchPublisherKpisFromPostgres(publisherKey.trim())) as unknown as PublisherKpi[]
}
