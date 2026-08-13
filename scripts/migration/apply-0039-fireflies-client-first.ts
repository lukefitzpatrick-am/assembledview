/**
 * AUTHOR ONLY — apply db/migrations/0039_fireflies_client_first.sql
 * (client_name_aliases + email_aliases). Idempotent.
 */
import fs from "node:fs"
import path from "node:path"

import postgres from "postgres"

import { loadEnvLocal } from "./_shared"

async function main() {
  loadEnvLocal()
  const url = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim()
  if (!url) throw new Error("DIRECT_URL or DATABASE_URL is required")

  const body = fs.readFileSync(
    path.resolve("db/migrations/0039_fireflies_client_first.sql"),
    "utf8"
  )
  const sql = postgres(url, { prepare: false, max: 1, ssl: "require" })
  type AliasColumnRow = { table_name: string; column_name: string }
  try {
    await sql.unsafe(body)
    const cols = await sql.unsafe<AliasColumnRow[]>(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'clients' AND column_name = 'client_name_aliases')
          OR (table_name = 'team_members' AND column_name = 'email_aliases')
        )
      ORDER BY table_name, column_name
    `)
    console.log(
      JSON.stringify({
        ok: true,
        columns: cols.map((c) => `${c.table_name}.${c.column_name}`),
      })
    )
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
