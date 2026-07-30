import "server-only"

import { xanoUrl, xanoAuthHeader } from "@/lib/api/xano"
import { getDataBackend } from "@/lib/data/backend"
import {
  fetchReferenceTableFromPostgres,
  isReferenceTablePath,
  type ReferenceTablePath,
} from "@/lib/data/referenceTables"
import { compareReferenceRows, recordShadowDiff } from "@/lib/data/shadowDiff"

async function fetchReferenceFromXano(path: ReferenceTablePath): Promise<{
  status: number
  body: unknown
  contentType: string
}> {
  const targetUrl = xanoUrl(path, "XANO_MEDIA_DETAILS_BASE_URL")
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

async function runShadowCompare(path: ReferenceTablePath, xanoBody: unknown): Promise<void> {
  try {
    const postgresRows = await fetchReferenceTableFromPostgres(path)
    const event = compareReferenceRows(path, xanoBody, postgresRows)
    recordShadowDiff(event)
  } catch (err) {
    console.error("[migration-shadow-diff] compare failed", { path, err })
  }
}

/**
 * Server-side reference-table GET with DATA_BACKEND switch.
 * - xano: Xano only
 * - shadow: serve Xano; async compare vs Supabase (no user impact)
 * - postgres: serve Supabase
 */
export async function readReferenceMediaDetail(path: string): Promise<{
  status: number
  body: unknown
  contentType: string
}> {
  if (!isReferenceTablePath(path)) {
    throw new Error(`Not a reference table path: ${path}`)
  }

  const backend = getDataBackend()

  if (backend === "postgres") {
    const rows = await fetchReferenceTableFromPostgres(path)
    return { status: 200, body: rows, contentType: "application/json" }
  }

  const xano = await fetchReferenceFromXano(path)

  if (backend === "shadow" && xano.contentType.includes("application/json")) {
    void runShadowCompare(path, xano.body)
  }

  return xano
}
