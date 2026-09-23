/**
 * Author-only: probe whether Xano channel-table pagination under-counts on a big MBA.
 *
 *   npx tsx --import ./scripts/test-shims/register-server-only.mjs \
 *     scripts/verify/probe-xano-line-item-pagination.ts --mba=PENFOLD020
 */
import { readFileSync } from "node:fs"

import { fetchAllXanoPagesWithCompleteness } from "@/lib/api/xanoPagination"
import { xanoUrl } from "@/lib/api/xano"
import { MEDIA_PLAN_TABLES } from "@/lib/xano/mediaPlanTables"

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

function parseMba(): string {
  const arg = process.argv.find((a) => a.startsWith("--mba="))
  const mba = (arg?.slice("--mba=".length) || process.env.PROBE_MBA || "PENFOLD020")
    .trim()
    .toUpperCase()
  return mba
}

async function main() {
  loadEnvLocal()
  const mba = parseMba()
  const pageSize = 50
  const maxPages = 40
  const MEDIA_PLANS_BASE_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]

  const perTable: Array<{
    table: string
    items: number
    complete: boolean
    pages_guess: number
    mba_rows: number
  }> = []

  for (const table of MEDIA_PLAN_TABLES) {
    const baseUrl = xanoUrl(table.table_name, MEDIA_PLANS_BASE_KEYS)
    const label = `PROBE:${table.table_name}`
    const { items, complete } = await fetchAllXanoPagesWithCompleteness(
      baseUrl,
      {},
      label,
      pageSize,
      maxPages
    )
    const mbaRows = items.filter((row) => {
      if (!row || typeof row !== "object") return false
      const r = row as Record<string, unknown>
      return String(r.mba_number ?? r.mbaNumber ?? "")
        .trim()
        .toUpperCase() === mba
    })
    perTable.push({
      table: table.table_name,
      items: items.length,
      complete,
      pages_guess: Math.ceil(items.length / pageSize) || 0,
      mba_rows: mbaRows.length,
    })
  }

  const incomplete = perTable.filter((t) => !t.complete)
  console.log(
    JSON.stringify(
      {
        mba,
        pageSize,
        maxPages,
        tables: perTable,
        incomplete_tables: incomplete.map((t) => t.table),
        incomplete_count: incomplete.length,
        mba_row_sum: perTable.reduce((s, t) => s + t.mba_rows, 0),
        note:
          incomplete.length > 0
            ? "complete=false means pagination early-stop / under-count smell"
            : "all tables reported complete at this pageSize",
      },
      null,
      2
    )
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
