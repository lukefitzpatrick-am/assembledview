/**
 * Author-only: Xano vs PG line-item snapshot parity (no Snowflake write).
 *
 *   npm run verify:line-item-snapshot-parity
 */
import { readFileSync } from "node:fs"

import { closeDb } from "@/db"
import { fetchAllPgLineItems } from "@/lib/snowflake/fetchAllPgLineItems"
import { buildLineItemSnapshotParityReport } from "@/lib/snowflake/syncPgLineItems"
import { fetchAllXanoLineItems } from "@/lib/xano/fetchAllLineItems"

function loadEnvLocal() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = line.match(/^([^#=]+)=(.*)$/)
      if (!m) continue
      const k = m[1].trim()
      let v = m[2].trim()
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1)
      }
      if (!process.env[k]) process.env[k] = v
    }
  } catch {
    // optional
  }
}

async function main() {
  loadEnvLocal()
  const started = Date.now()
  const [xano, pg] = await Promise.all([
    fetchAllXanoLineItems(),
    fetchAllPgLineItems(),
  ])
  const report = buildLineItemSnapshotParityReport(xano.items, pg.items, {
    xanoComplete: xano.complete,
    pgComplete: pg.complete,
    sampleSize: 40,
  })

  console.log(
    JSON.stringify(
      {
        duration_ms: Date.now() - started,
        ...report,
        // keep stdout readable — full mismatched in file if huge
        mismatched: report.mismatched.slice(0, 200),
        mismatched_truncated: report.mismatched.length > 200,
      },
      null,
      2
    )
  )

  await closeDb()
  if (report.mba_mismatches > 0) process.exitCode = 2
}

main().catch(async (err) => {
  console.error(err)
  try {
    await closeDb()
  } catch {
    // ignore
  }
  process.exit(1)
})
