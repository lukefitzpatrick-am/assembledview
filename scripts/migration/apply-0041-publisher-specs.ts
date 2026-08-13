/**
 * AUTHOR ONLY — apply db/migrations/0041_publisher_specs.sql
 * (publisher_specs + spec_runs + explicit join seed). Idempotent.
 */
import fs from "node:fs"
import path from "node:path"

import postgres from "postgres"

import { loadEnvLocal } from "./_shared"

type SpecJoinRow = {
  publisher_slug: string
  publisher_id: number | null
}

async function main() {
  loadEnvLocal()
  const url = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim()
  if (!url) throw new Error("DIRECT_URL or DATABASE_URL is required")

  const body = fs.readFileSync(
    path.resolve("db/migrations/0041_publisher_specs.sql"),
    "utf8",
  )
  const sql = postgres(url, { prepare: false, max: 1, ssl: "require" })
  try {
    await sql.unsafe(body)
    const rows = await sql.unsafe<SpecJoinRow[]>(`
      SELECT publisher_slug, publisher_id
      FROM public.publisher_specs
      ORDER BY publisher_slug
    `)
    console.log(
      JSON.stringify({
        ok: true,
        count: rows.length,
        joins: rows.map((r) => `${r.publisher_slug}=${r.publisher_id ?? "NULL"}`),
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
