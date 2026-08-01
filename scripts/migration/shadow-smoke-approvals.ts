/**
 * One-shot X1 shadow smoke for mba_line_approvals.
 * Usage: npm run test:approvals is the suite; this probes live Xano↔PG.
 *   npx tsx scripts/migration/shadow-smoke-approvals.ts
 */
import { and, eq, sql } from "drizzle-orm"
import { loadEnvLocal } from "./_shared"
import { closeDb, getDb, schema } from "@/db"
import {
  getXanoBaseUrl,
  parseXanoListPayload,
  xanoAuthHeaderRecord,
} from "@/lib/api/xano"
import { coerceNumericStringsToNumbers, toApiRow } from "@/lib/data/toApiRow"
import { compareReferenceRows } from "@/lib/data/shadowDiff"

const MEDIA = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const

type ApprovalRow = Record<string, unknown>

function mapPg(row: Record<string, unknown>): ApprovalRow {
  const shaped = coerceNumericStringsToNumbers(toApiRow(row))
  return {
    id: shaped.id != null ? Number(shaped.id) : undefined,
    created_at: shaped.created_at ?? null,
    mba_number: String(shaped.mba_number ?? ""),
    media_plan_version: Number(shaped.media_plan_version ?? 0),
    line_item_id: String(shaped.line_item_id ?? ""),
    media_type: String(shaped.media_type ?? ""),
    approved: shaped.approved === true || shaped.approved === "true",
    approved_in_version:
      shaped.approved_in_version == null || shaped.approved_in_version === ""
        ? null
        : Number(shaped.approved_in_version),
  }
}

function strip(rows: ApprovalRow[]): ApprovalRow[] {
  return rows.map(({ created_at: _c, ...rest }) => rest)
}

async function fetchXano(mba: string, ver: number): Promise<ApprovalRow[]> {
  const base = getXanoBaseUrl([...MEDIA])
  const qs = new URLSearchParams({
    mba_number: mba,
    media_plan_version: String(ver),
  })
  const res = await fetch(`${base}/mba_line_approvals?${qs}`, {
    headers: { Accept: "application/json", ...xanoAuthHeaderRecord() },
    signal: AbortSignal.timeout(15_000),
  })
  const body = await res.json()
  if (!res.ok) {
    throw new Error(`Xano ${res.status} ${JSON.stringify(body).slice(0, 200)}`)
  }
  const list = Array.isArray(body)
    ? body
    : (parseXanoListPayload(body) as unknown[])
  return list.filter(
    (r): r is ApprovalRow => !!r && typeof r === "object" && !Array.isArray(r)
  )
}

async function fetchPg(mba: string, ver: number): Promise<ApprovalRow[]> {
  const db = getDb()
  const rows = await db
    .select()
    .from(schema.mbaLineApprovals)
    .where(
      and(
        eq(schema.mbaLineApprovals.mbaNumber, mba),
        eq(schema.mbaLineApprovals.mediaPlanVersion, ver)
      )
    )
  return rows.map((r) => mapPg(r as Record<string, unknown>))
}

function report(
  label: string,
  mba: string,
  ver: number,
  xano: ApprovalRow[],
  pg: ApprovalRow[]
): number {
  const event = compareReferenceRows(
    "mba_line_approvals",
    strip(xano),
    strip(pg),
    { domain: "approvals", postgresKeysOnly: true }
  )
  const total =
    event.missingInPostgres.length +
    event.missingInXano.length +
    event.fieldDiffs.length
  console.log(`--- ${label} ---`)
  console.log(`MBA: ${mba} v${ver}`)
  console.log(`xanoCount: ${event.xanoCount} postgresCount: ${event.postgresCount}`)
  console.log(`missingInPostgres: ${event.missingInPostgres.length}`)
  console.log(`missingInXano: ${event.missingInXano.length}`)
  console.log(`fieldDiffs: ${event.fieldDiffs.length}`)
  console.log(`DIFF_TOTAL: ${total}`)
  return total
}

async function main(): Promise<void> {
  loadEnvLocal()
  process.env.DATA_BACKEND_APPROVALS = "shadow"

  const db = getDb()
  const other = (await db.execute(
    sql.raw(`
      SELECT m.mba_number, v.version_number
      FROM media_plan_masters m
      JOIN media_plan_versions v ON v.id = m.published_version_id
      WHERE lower(m.mba_number) <> 'krusty015'
      ORDER BY m.mba_number
      LIMIT 1
    `)
  )) as unknown as Array<{ mba_number: string; version_number: number }>

  const otherMba = other[0]
  if (!otherMba) throw new Error("No other MBA found for all-in probe")

  const withExMba = "krusty015"
  const withExVer = 5
  const allInMba = String(otherMba.mba_number)
  const allInVer = Number(otherMba.version_number)

  const [x1, p1, x2, p2] = await Promise.all([
    fetchXano(withExMba, withExVer),
    fetchPg(withExMba, withExVer),
    fetchXano(allInMba, allInVer),
    fetchPg(allInMba, allInVer),
  ])

  const d1 = report("HAS exclusion", withExMba, withExVer, x1, p1)
  const d2 = report("NO exclusion (all-in)", allInMba, allInVer, x2, p2)

  console.log(`DATA_BACKEND_APPROVALS=${process.env.DATA_BACKEND_APPROVALS}`)
  console.log(`SHADOW_RESULT: ${d1}/${d2} (expect 0/0)`)
  await closeDb()
  if (d1 !== 0 || d2 !== 0) process.exit(1)
}

main().catch(async (err) => {
  console.error(err)
  await closeDb().catch(() => undefined)
  process.exit(1)
})
