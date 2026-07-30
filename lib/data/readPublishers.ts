import "server-only"

import { eq } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { xanoUrl, xanoAuthHeader } from "@/lib/api/xano"
import { getDataBackendFor } from "@/lib/data/backend"
import { coerceNumericStringsToNumbers, toApiRow } from "@/lib/data/toApiRow"
import { compareReferenceRows, recordShadowDiff } from "@/lib/data/shadowDiff"

const DOMAIN = "publishers" as const
const TABLE = "publishers"

export function mapPublisherRowFromPostgres(
  row: Record<string, unknown>
): Record<string, unknown> {
  const api = toApiRow(row)
  // best_practice jsonb passthrough (already an object from drizzle)
  return coerceNumericStringsToNumbers(api)
}

export async function fetchPublishersFromPostgres(): Promise<Record<string, unknown>[]> {
  const db = getDb()
  const rows = await db.select().from(schema.publishers)
  return rows.map((row) => mapPublisherRowFromPostgres(row as Record<string, unknown>))
}

async function fetchPublishersFromXano(): Promise<{
  status: number
  body: unknown
  contentType: string
}> {
  const targetUrl = xanoUrl("get_publishers", "XANO_PUBLISHERS_BASE_URL")
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

async function runShadowCompare(xanoBody: unknown): Promise<void> {
  try {
    const postgresRows = await fetchPublishersFromPostgres()
    const event = compareReferenceRows(TABLE, xanoBody, postgresRows, {
      domain: DOMAIN,
      postgresKeysOnly: true,
    })
    recordShadowDiff(event)
  } catch (err) {
    console.error("[migration-shadow-diff] compare failed", { domain: DOMAIN, err })
  }
}

/**
 * Publishers list GET with DATA_BACKEND_PUBLISHERS / DATA_BACKEND switch.
 * - xano: Xano only
 * - shadow: serve Xano; async compare vs Supabase (no user impact)
 * - postgres: serve Supabase
 */
export async function readPublishersList(): Promise<{
  status: number
  body: unknown
  contentType: string
}> {
  const backend = getDataBackendFor(DOMAIN)

  if (backend === "postgres") {
    const rows = await fetchPublishersFromPostgres()
    return { status: 200, body: rows, contentType: "application/json" }
  }

  const xano = await fetchPublishersFromXano()

  if (backend === "shadow" && xano.contentType.includes("application/json")) {
    void runShadowCompare(xano.body)
  }

  return xano
}

export async function readPublisherById(id: string | number): Promise<{
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
      .from(schema.publishers)
      .where(eq(schema.publishers.id, numericId))
      .limit(1)
    const row = rows[0]
    if (!row) {
      return { status: 404, body: { error: "not found" }, contentType: "application/json" }
    }
    return {
      status: 200,
      body: mapPublisherRowFromPostgres(row as Record<string, unknown>),
      contentType: "application/json",
    }
  }

  // List endpoint is the only Xano publishers read used by the app; filter locally.
  const list = await fetchPublishersFromXano()
  if (!list.contentType.includes("application/json") || list.status >= 400) {
    return list
  }
  const rows = Array.isArray(list.body) ? list.body : []
  const match = rows.find((r) => {
    if (!r || typeof r !== "object") return false
    const rec = r as Record<string, unknown>
    return String(rec.id) === rawId || String(rec.publisherid ?? "") === rawId
  })
  if (!match) {
    return { status: 404, body: { error: "not found" }, contentType: "application/json" }
  }

  if (backend === "shadow") {
    void (async () => {
      try {
        if (!Number.isFinite(numericId)) return
        const db = getDb()
        const pgRows = await db
          .select()
          .from(schema.publishers)
          .where(eq(schema.publishers.id, numericId))
          .limit(1)
        const mapped = pgRows.map((row) =>
          mapPublisherRowFromPostgres(row as Record<string, unknown>)
        )
        const event = compareReferenceRows(TABLE, [match], mapped, {
          domain: DOMAIN,
          postgresKeysOnly: true,
        })
        recordShadowDiff(event)
      } catch (err) {
        console.error("[migration-shadow-diff] compare failed", { domain: DOMAIN, err })
      }
    })()
  }

  return { status: 200, body: match, contentType: "application/json" }
}
