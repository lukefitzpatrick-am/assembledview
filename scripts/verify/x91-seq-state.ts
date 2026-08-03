/**
 * X9.1 report helper — print last_value vs MAX(id). Does not mutate sequences.
 */
import { loadEnvLocal } from "../../scripts/migration/_shared.js"
import { getDb, closeDb } from "@/db"
import { sql } from "drizzle-orm"

loadEnvLocal()

async function main() {
  const db = getDb()
  const rows = await db.execute(sql`
    SELECT 'media_plan_masters' AS t,
      COALESCE((SELECT MAX(id)::bigint FROM media_plan_masters), 0) AS max_id,
      (SELECT last_value FROM media_plan_masters_id_seq) AS last_value
    UNION ALL
    SELECT 'clients',
      COALESCE((SELECT MAX(id)::bigint FROM clients), 0),
      (SELECT last_value FROM clients_id_seq)
  `)
  for (const r of rows as unknown as { t: string; max_id: string; last_value: string }[]) {
    const maxId = Number(r.max_id)
    const last = Number(r.last_value)
    const gap = last - maxId
    console.log(
      `${r.t}: max(id)=${maxId} last_value=${last} gap=${gap} (${gap > 0 ? "seq ahead — do not rewind" : gap < 0 ? "seq BEHIND — run no-rewind sync" : "aligned"})`
    )
  }
  await closeDb()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
