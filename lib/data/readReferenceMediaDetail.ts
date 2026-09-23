import "server-only"

import {
  fetchReferenceTableFromPostgres,
  isReferenceTablePath,
} from "@/lib/data/referenceTables"

/** Server-side reference-table GET. Postgres only. */
export async function readReferenceMediaDetail(path: string): Promise<{
  status: number
  body: unknown
  contentType: string
}> {
  if (!isReferenceTablePath(path)) {
    throw new Error(`Not a reference table path: ${path}`)
  }

  const rows = await fetchReferenceTableFromPostgres(path)
  return { status: 200, body: rows, contentType: "application/json" }
}
