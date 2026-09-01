/**
 * AUTHOR ONLY — apply db/migrations/0055_line_item_panels_unique.sql
 * Partial unique index uq_line_item_panels_line_source. Idempotent.
 * Same SQL as the Supabase SQL Editor path; do not drizzle-kit migrate.
 */
import fs from "node:fs"
import path from "node:path"

import postgres from "postgres"

import { loadEnvLocal } from "./_shared"

type CountRow = { n: string | number }
type DupRow = { n: string | number }
type IndexRow = { indexname: string; indexdef: string }

async function main() {
  loadEnvLocal()
  const url = (process.env.DIRECT_URL || "").trim()
  if (!url) throw new Error("DIRECT_URL is required (port 5432; not the pooler)")

  const body = fs.readFileSync(
    path.resolve("db/migrations/0055_line_item_panels_unique.sql"),
    "utf8",
  )
  const sql = postgres(url, { prepare: false, max: 1, ssl: "require" })
  try {
    const [rowCount] = await sql.unsafe<CountRow[]>(
      `SELECT COUNT(*)::text AS n FROM public.line_item_panels`,
    )
    const [dups] = await sql.unsafe<DupRow[]>(`
      SELECT COUNT(*)::text AS n FROM (
        SELECT line_item_id, source_row_ref
        FROM public.line_item_panels
        WHERE source_row_ref IS NOT NULL
        GROUP BY 1, 2
        HAVING COUNT(*) > 1
      ) d
    `)
    const before = await sql.unsafe<IndexRow[]>(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = 'uq_line_item_panels_line_source'
    `)

    const dupCount = Number(dups?.n ?? 0)
    if (dupCount > 0) {
      throw new Error(
        `Refusing 0055: ${dupCount} duplicate (line_item_id, source_row_ref) group(s)`,
      )
    }

    await sql.unsafe(body)

    const after = await sql.unsafe<IndexRow[]>(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = 'uq_line_item_panels_line_source'
    `)
    if (after.length !== 1) {
      throw new Error("Index missing after apply")
    }

    console.log(
      JSON.stringify({
        ok: true,
        panel_rows: Number(rowCount?.n ?? 0),
        duplicate_groups: dupCount,
        existed_before: before.length > 0,
        index: after[0],
      }),
    )
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
