/**
 * One-off probe: does Xano revenue_forecast_lines hold data?
 * Usage: npx tsx --import ./scripts/test-shims/register-server-only.mjs ...
 */
import { sql } from "drizzle-orm"
import { getDb } from "@/db"
import { loadEnvLocal } from "@/scripts/migration/_shared"

loadEnvLocal()

function unwrapArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>
    for (const k of ["data", "items", "lines", "result"]) {
      if (Array.isArray(p[k])) return p[k] as unknown[]
    }
  }
  return []
}

async function main() {
  const base = (
    process.env.XANO_FINANCE_FORECAST_TARGETS_BASE_URL ||
    process.env.XANO_CLIENTS_BASE_URL ||
    ""
  ).replace(/\/$/, "")
  const key = process.env.XANO_API_KEY || ""
  if (!base || !key) {
    console.error("Missing Xano base URL or XANO_API_KEY")
    process.exit(2)
  }

  const db = getDb()
  const clientResult = await db.execute(sql`
    SELECT id FROM clients ORDER BY id
  `)
  const clientRows = (
    Array.isArray(clientResult)
      ? clientResult
      : ((clientResult as { rows?: { id: number }[] }).rows ?? [])
  ) as { id: number }[]

  console.log(`PG clients: ${clientRows.length}`)

  let total = 0
  const nonempty: Array<{ id: number; fy: number; n: number }> = []
  const fys = [2023, 2024, 2025, 2026, 2027]

  for (const c of clientRows) {
    for (const fy of fys) {
      const url =
        `${base}/revenue_forecast_lines` +
        `?financial_year_start_year=${fy}&client_id=${encodeURIComponent(String(c.id))}`
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
      })
      if (!res.ok) continue
      const arr = unwrapArray(await res.json())
      if (arr.length) {
        total += arr.length
        nonempty.push({ id: c.id, fy, n: arr.length })
      }
    }
  }

  console.log(`Xano revenue_forecast_lines rows (sum over clients×FY): ${total}`)
  console.log(`Non-empty client×FY buckets: ${nonempty.length}`)
  if (nonempty.length) {
    console.log("sample:", JSON.stringify(nonempty.slice(0, 15)))
  }

  const catRes = await fetch(`${base}/revenue_line_catalog?active=true`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  })
  const catArr = catRes.ok ? unwrapArray(await catRes.json()) : []
  console.log(`Xano revenue_line_catalog?active=true: ${catRes.status} len=${catArr.length}`)

  const pgLines = await db.execute(sql`SELECT count(*)::int AS n FROM revenue_forecast_lines`)
  const pgCat = await db.execute(sql`SELECT count(*)::int AS n FROM revenue_line_catalog`)
  const pl = (
    Array.isArray(pgLines) ? pgLines[0] : (pgLines as { rows: { n: number }[] }).rows[0]
  ) as { n: number }
  const pc = (
    Array.isArray(pgCat) ? pgCat[0] : (pgCat as { rows: { n: number }[] }).rows[0]
  ) as { n: number }
  console.log(`PG revenue_forecast_lines: ${pl.n}`)
  console.log(`PG revenue_line_catalog: ${pc.n}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
