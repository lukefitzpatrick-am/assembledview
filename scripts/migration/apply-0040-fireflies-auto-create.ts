/**
 * AUTHOR ONLY — apply db/migrations/0040_fireflies_auto_create.sql
 * (tasks.auto_created + tasks.ava_auto_key). Idempotent.
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
    path.resolve("db/migrations/0040_fireflies_auto_create.sql"),
    "utf8"
  )
  const sql = postgres(url, { prepare: false, max: 1, ssl: "require" })
  try {
    await sql.unsafe(body)
    const cols = await sql.unsafe(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'tasks'
        AND column_name IN ('auto_created', 'ava_auto_key')
      ORDER BY column_name
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
