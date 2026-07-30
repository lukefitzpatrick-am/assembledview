import "server-only"

import { and, eq } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { fetchAllXanoPages } from "@/lib/api/xanoPagination"
import { parseXanoListPayload, xanoAuthHeader, xanoUrl } from "@/lib/api/xano"
import { getDataBackendFor } from "@/lib/data/backend"
import { coerceNumericStringsToNumbers, toApiRow } from "@/lib/data/toApiRow"
import { compareReferenceRows, recordShadowDiff } from "@/lib/data/shadowDiff"
import type { CampaignKPI, ClientKpi, PublisherKpi } from "@/lib/kpi/types"

const DOMAIN = "kpi" as const

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

function asKpiList(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) {
    return body.filter(
      (row): row is Record<string, unknown> =>
        !!row && typeof row === "object" && !Array.isArray(row)
    )
  }
  return parseXanoListPayload(body) as Record<string, unknown>[]
}

async function fetchJson(
  url: string,
  init?: RequestInit
): Promise<{ status: number; body: unknown; contentType: string }> {
  const upstream = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...xanoAuthHeader(),
      ...(init?.headers ?? {}),
    },
  })
  const contentType = upstream.headers.get("content-type") || ""
  const body = contentType.includes("application/json")
    ? await upstream.json()
    : await upstream.text()
  return { status: upstream.status, body, contentType }
}

function runKpiShadowCompare(
  table: string,
  xanoBody: unknown,
  postgresRows: Record<string, unknown>[]
): void {
  try {
    const event = compareReferenceRows(table, xanoBody, postgresRows, {
      domain: DOMAIN,
      postgresKeysOnly: true,
      kpiNumericCompare: true,
    })
    recordShadowDiff(event)
  } catch (err) {
    console.error("[migration-shadow-diff] compare failed", { domain: DOMAIN, table, err })
  }
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
        eq(schema.campaignKpi.mbaNumber, mbaNumber),
        eq(schema.campaignKpi.versionNumber, versionNumber)
      )
    )
  return rows.map((row) => mapKpiRowFromPostgres(row as Record<string, unknown>))
}

/** Xano-only GET — used by syncCampaignKpis write path until T4. */
export async function fetchCampaignKpisFromXano(
  mbaNumber: string,
  versionNumber: number
): Promise<Record<string, unknown>[]> {
  const url = xanoUrl("campaign_kpi", "XANO_CLIENTS_BASE_URL")
  const qs = new URLSearchParams({
    mba_number: mbaNumber,
    version_number: String(versionNumber),
  })
  const result = await fetchJson(`${url}?${qs.toString()}`)
  if (result.status >= 400) {
    throw new Error(`Xano campaign_kpi GET failed: ${result.status}`)
  }
  const list = asKpiList(result.body)
  const mba = mbaNumber
  return list.filter((row) => {
    const rowMba = String(row.mba_number ?? row.mbaNumber ?? "")
    const ver = Number(row.version_number ?? row.versionNumber ?? NaN)
    return rowMba === mba && ver === versionNumber
  })
}

/**
 * campaign_kpi list for one (mba, version) with DATA_BACKEND_KPI / DATA_BACKEND.
 * Writes (sync/create/patch/delete) stay on Xano until T4.
 */
export async function readCampaignKpis(
  mbaNumber: string,
  versionNumber: number
): Promise<CampaignKPI[]> {
  const backend = getDataBackendFor(DOMAIN)

  if (backend === "postgres") {
    return (await fetchCampaignKpisFromPostgres(
      mbaNumber,
      versionNumber
    )) as unknown as CampaignKPI[]
  }

  const xanoRows = await fetchCampaignKpisFromXano(mbaNumber, versionNumber)

  if (backend === "shadow") {
    void (async () => {
      try {
        const postgresRows = await fetchCampaignKpisFromPostgres(
          mbaNumber,
          versionNumber
        )
        runKpiShadowCompare("campaign_kpi", xanoRows, postgresRows)
      } catch (err) {
        console.error("[migration-shadow-diff] compare failed", {
          domain: DOMAIN,
          table: "campaign_kpi",
          err,
        })
      }
    })()
  }

  return xanoRows as unknown as CampaignKPI[]
}

export async function fetchCampaignKpisForMbasFromPostgres(
  pairs: KpiMbaVersionPair[]
): Promise<Record<string, unknown>[]> {
  if (pairs.length === 0) return []
  const out: Record<string, unknown>[] = []
  for (const { mbaNumber, versionNumber } of pairs) {
    const rows = await fetchCampaignKpisFromPostgres(mbaNumber, versionNumber)
    out.push(...rows)
  }
  return out
}

/** Paginated Xano fetch for pacing bulk loaders (pre-switch path). */
export async function fetchCampaignKpisForMbasFromXano(
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

  const results: Record<string, unknown>[] = []
  const url = xanoUrl("campaign_kpi", "XANO_CLIENTS_BASE_URL")

  for (const { mbaNumber, versionNumber } of uniquePairs) {
    try {
      const rows = await fetchAllXanoPages(
        url,
        { mba_number: mbaNumber, version_number: versionNumber },
        `campaign_kpi_${mbaNumber}_v${versionNumber}`,
        200,
        50
      )
      results.push(...(rows as Record<string, unknown>[]))
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 404) continue
      const body = (err as { response?: { data?: unknown } })?.response?.data
      throw new Error(
        `Xano campaign_kpi GET failed for mba=${mbaNumber} version=${versionNumber}: ${status ?? "unknown"} ${String(body ?? "")}`
      )
    }
  }

  return results
}

export async function readCampaignKpisForMbas(
  pairs: KpiMbaVersionPair[]
): Promise<Record<string, unknown>[]> {
  const backend = getDataBackendFor(DOMAIN)

  if (backend === "postgres") {
    return fetchCampaignKpisForMbasFromPostgres(pairs)
  }

  const xanoRows = await fetchCampaignKpisForMbasFromXano(pairs)

  if (backend === "shadow" && xanoRows.length > 0) {
    void (async () => {
      try {
        // Compare per unique pair to keep payloads bounded.
        const seen = new Set<string>()
        for (const pair of pairs) {
          const key = `${pair.mbaNumber}|${pair.versionNumber}`
          if (seen.has(key)) continue
          seen.add(key)
          const xanoSlice = xanoRows.filter(
            (r) =>
              String(r.mba_number) === pair.mbaNumber &&
              Number(r.version_number) === pair.versionNumber
          )
          const postgresRows = await fetchCampaignKpisFromPostgres(
            pair.mbaNumber,
            pair.versionNumber
          )
          runKpiShadowCompare("campaign_kpi", xanoSlice, postgresRows)
        }
      } catch (err) {
        console.error("[migration-shadow-diff] compare failed", {
          domain: DOMAIN,
          table: "campaign_kpi",
          err,
        })
      }
    })()
  }

  return xanoRows
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

export async function fetchClientKpisFromXano(
  clientName: string
): Promise<Record<string, unknown>[]> {
  const url = xanoUrl("client_kpi", "XANO_CLIENTS_BASE_URL")
  const qs = new URLSearchParams({ mp_client_name: clientName })
  const result = await fetchJson(`${url}?${qs.toString()}`)
  if (result.status >= 400) {
    throw new Error(`Xano client_kpi GET failed: ${result.status}`)
  }
  return asKpiList(result.body)
}

export async function readClientKpis(clientName: string): Promise<ClientKpi[]> {
  const backend = getDataBackendFor(DOMAIN)

  if (backend === "postgres") {
    return (await fetchClientKpisFromPostgres(clientName)) as unknown as ClientKpi[]
  }

  const xanoRows = await fetchClientKpisFromXano(clientName)

  if (backend === "shadow") {
    void (async () => {
      try {
        const postgresRows = await fetchClientKpisFromPostgres(clientName)
        runKpiShadowCompare("client_kpi", xanoRows, postgresRows)
      } catch (err) {
        console.error("[migration-shadow-diff] compare failed", {
          domain: DOMAIN,
          table: "client_kpi",
          err,
        })
      }
    })()
  }

  return xanoRows as unknown as ClientKpi[]
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

export async function fetchAllPublisherKpisFromXano(): Promise<
  Record<string, unknown>[]
> {
  const url = xanoUrl("publisher_kpi", "XANO_PUBLISHERS_BASE_URL")
  const result = await fetchJson(url)
  if (result.status >= 400) {
    throw new Error(`Xano publisher_kpi GET failed: ${result.status}`)
  }
  return asKpiList(result.body)
}

export async function fetchPublisherKpisFromXano(
  publisherKey: string
): Promise<Record<string, unknown>[]> {
  const url = xanoUrl("publisher_kpi", "XANO_PUBLISHERS_BASE_URL")
  const qs = new URLSearchParams({ publisher: publisherKey.trim() })
  const result = await fetchJson(`${url}?${qs.toString()}`)
  if (result.status >= 400) {
    throw new Error(`Xano publisher_kpi GET failed: ${result.status}`)
  }
  return asKpiList(result.body)
}

export async function readAllPublisherKpis(): Promise<PublisherKpi[]> {
  const backend = getDataBackendFor(DOMAIN)

  if (backend === "postgres") {
    return (await fetchAllPublisherKpisFromPostgres()) as unknown as PublisherKpi[]
  }

  const xanoRows = await fetchAllPublisherKpisFromXano()

  if (backend === "shadow") {
    void (async () => {
      try {
        const postgresRows = await fetchAllPublisherKpisFromPostgres()
        runKpiShadowCompare("publisher_kpi", xanoRows, postgresRows)
      } catch (err) {
        console.error("[migration-shadow-diff] compare failed", {
          domain: DOMAIN,
          table: "publisher_kpi",
          err,
        })
      }
    })()
  }

  return xanoRows as unknown as PublisherKpi[]
}

export async function readPublisherKpis(
  publisherKey: string
): Promise<PublisherKpi[]> {
  const key = publisherKey.trim()
  const backend = getDataBackendFor(DOMAIN)

  if (backend === "postgres") {
    return (await fetchPublisherKpisFromPostgres(key)) as unknown as PublisherKpi[]
  }

  const xanoRows = await fetchPublisherKpisFromXano(key)

  if (backend === "shadow") {
    void (async () => {
      try {
        const postgresRows = await fetchPublisherKpisFromPostgres(key)
        runKpiShadowCompare("publisher_kpi", xanoRows, postgresRows)
      } catch (err) {
        console.error("[migration-shadow-diff] compare failed", {
          domain: DOMAIN,
          table: "publisher_kpi",
          err,
        })
      }
    })()
  }

  return xanoRows as unknown as PublisherKpi[]
}
