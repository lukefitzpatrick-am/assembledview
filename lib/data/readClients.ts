import "server-only"

import { eq } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { getXanoClientsCollectionUrl } from "@/lib/api/xanoClients"
import { xanoAuthHeader } from "@/lib/api/xano"
import { getDataBackendFor } from "@/lib/data/backend"
import { coerceNumericStringsToNumbers, toApiRow } from "@/lib/data/toApiRow"
import { compareReferenceRows, recordShadowDiff } from "@/lib/data/shadowDiff"

const DOMAIN = "clients" as const
const TABLE = "clients"

const ABN_AS_TEXT = new Set(["abn"])

export function mapClientRowFromPostgres(
  row: Record<string, unknown>
): Record<string, unknown> {
  const api = toApiRow(row)
  // clients.abn is text in Postgres; keep as text (do not coerce to number).
  return coerceNumericStringsToNumbers(api, { keepAsText: ABN_AS_TEXT })
}

export async function fetchClientsFromPostgres(): Promise<Record<string, unknown>[]> {
  const db = getDb()
  const rows = await db.select().from(schema.clients)
  return rows.map((row) => mapClientRowFromPostgres(row as Record<string, unknown>))
}

async function fetchClientsFromXano(): Promise<{
  status: number
  body: unknown
  contentType: string
}> {
  const targetUrl = getXanoClientsCollectionUrl()
  const upstream = await fetch(targetUrl, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...xanoAuthHeader(),
    },
  })
  const contentType = upstream.headers.get("content-type") || ""
  const body = contentType.includes("application/json")
    ? await upstream.json()
    : await upstream.text()
  return { status: upstream.status, body, contentType }
}

async function fetchClientByIdFromXano(id: string): Promise<{
  status: number
  body: unknown
  contentType: string
}> {
  const targetUrl = `${getXanoClientsCollectionUrl()}/${encodeURIComponent(id)}`
  const upstream = await fetch(targetUrl, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...xanoAuthHeader(),
    },
  })
  const contentType = upstream.headers.get("content-type") || ""
  const body = contentType.includes("application/json")
    ? await upstream.json()
    : await upstream.text()
  return { status: upstream.status, body, contentType }
}

async function runShadowCompareList(xanoBody: unknown): Promise<void> {
  try {
    const postgresRows = await fetchClientsFromPostgres()
    const event = compareReferenceRows(TABLE, xanoBody, postgresRows, {
      domain: DOMAIN,
    })
    recordShadowDiff(event)
  } catch (err) {
    console.error("[migration-shadow-diff] compare failed", { domain: DOMAIN, err })
  }
}

/**
 * Clients list GET with DATA_BACKEND_CLIENTS / DATA_BACKEND switch.
 * Returns raw Xano-shaped rows (caller applies slug / omitClientBrain).
 */
export async function readClientsList(): Promise<{
  status: number
  body: unknown
  contentType: string
}> {
  const backend = getDataBackendFor(DOMAIN)

  if (backend === "postgres") {
    const rows = await fetchClientsFromPostgres()
    return { status: 200, body: rows, contentType: "application/json" }
  }

  const xano = await fetchClientsFromXano()

  if (backend === "shadow" && xano.contentType.includes("application/json")) {
    void runShadowCompareList(xano.body)
  }

  return xano
}

/**
 * Single client by id with DATA_BACKEND_CLIENTS / DATA_BACKEND switch.
 * Includes `client_brain` (text) when present — required for AVA brain tools.
 */
export async function readClientById(id: string | number): Promise<{
  status: number
  body: unknown
  contentType: string
}> {
  const rawId = String(id ?? "").trim()
  if (!rawId) {
    return { status: 404, body: { error: "not found" }, contentType: "application/json" }
  }

  const backend = getDataBackendFor(DOMAIN)
  const numericId = Number(rawId)

  if (backend === "postgres") {
    if (!Number.isFinite(numericId)) {
      return { status: 404, body: { error: "not found" }, contentType: "application/json" }
    }
    const db = getDb()
    const rows = await db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.id, numericId))
      .limit(1)
    const row = rows[0]
    if (!row) {
      return { status: 404, body: { error: "not found" }, contentType: "application/json" }
    }
    return {
      status: 200,
      body: mapClientRowFromPostgres(row as Record<string, unknown>),
      contentType: "application/json",
    }
  }

  const xano = await fetchClientByIdFromXano(rawId)

  if (
    backend === "shadow" &&
    xano.contentType.includes("application/json") &&
    xano.status < 400 &&
    xano.body &&
    typeof xano.body === "object"
  ) {
    void (async () => {
      try {
        if (!Number.isFinite(numericId)) return
        const db = getDb()
        const pgRows = await db
          .select()
          .from(schema.clients)
          .where(eq(schema.clients.id, numericId))
          .limit(1)
        const mapped = pgRows.map((row) =>
          mapClientRowFromPostgres(row as Record<string, unknown>)
        )
        const event = compareReferenceRows(TABLE, [xano.body as Record<string, unknown>], mapped, {
          domain: DOMAIN,
        })
        recordShadowDiff(event)
      } catch (err) {
        console.error("[migration-shadow-diff] compare failed", { domain: DOMAIN, err })
      }
    })()
  }

  return xano
}
