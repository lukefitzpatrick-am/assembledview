/**
 * KR-1 FIXTURE FIRST — dump ONE complete krusty version to local JSON.
 *
 * Author-only. Does not delete. Prefer a published tip with lines + schedule_months.
 *
 * Usage (from repo root):
 *   node --import ./scripts/test-shims/register-server-only.mjs \
 *     --require ./scripts/test-shims/mock-server-only.cjs \
 *     --import tsx scripts/cutover/01-export-krusty-fixture.ts
 *
 *   # optional pin:
 *   … -- --mba=krusty015 --version=4
 *
 * Output (gitignored recommended path):
 *   scripts/cutover/fixtures/krusty-complete-<mba>-v<n>.json
 *
 * Requires: DATABASE_URL (Supabase project slpdibnxtpdlttbbczvg pooler).
 */
import fs from "node:fs"
import path from "node:path"
import { and, desc, eq, sql, asc } from "drizzle-orm"
import { loadEnvLocal } from "../migration/_shared"
import { closeDb, getDb, schema } from "@/db"

loadEnvLocal()

type Args = { mba?: string; version?: number }

function parseArgs(argv: string[]): Args {
  const out: Args = {}
  for (const a of argv) {
    if (a.startsWith("--mba=")) out.mba = a.slice("--mba=".length).trim()
    if (a.startsWith("--version=")) {
      const n = Number(a.slice("--version=".length))
      if (Number.isFinite(n)) out.version = n
    }
  }
  return out
}

async function pickVersion(args: Args) {
  const db = getDb()

  if (args.mba && args.version != null) {
    const [row] = await db
      .select()
      .from(schema.mediaPlanVersions)
      .where(
        and(
          eq(schema.mediaPlanVersions.mbaNumber, args.mba),
          eq(schema.mediaPlanVersions.versionNumber, args.version)
        )
      )
      .limit(1)
    if (!row) {
      throw new Error(`No version ${args.mba} v${args.version}`)
    }
    return row
  }

  // Prefer richest krusty* tip: most schedule_months, then most line_items.
  const ranked = await db.execute(sql`
    SELECT
      v.id,
      v.mba_number,
      v.version_number,
      v.master_id,
      (SELECT count(*)::int FROM line_items li WHERE li.version_id = v.id) AS line_count,
      (SELECT count(*)::int FROM schedule_months sm WHERE sm.version_id = v.id) AS month_count
    FROM media_plan_versions v
    WHERE lower(v.mba_number) LIKE 'krusty%'
       OR lower(v.mba_number) LIKE 'krabby%'
    ORDER BY month_count DESC, line_count DESC, v.mba_number ASC, v.version_number DESC
    LIMIT 1
  `)

  const rows = Array.isArray(ranked)
    ? ranked
    : ((ranked as { rows?: Array<Record<string, unknown>> }).rows ?? [])
  const top = rows[0] as { id?: number } | undefined
  if (top?.id == null) {
    throw new Error(
      "No krusty*/krabby* versions in Postgres — nothing to fixture. Run discovery first."
    )
  }

  const [row] = await db
    .select()
    .from(schema.mediaPlanVersions)
    .where(eq(schema.mediaPlanVersions.id, Number(top.id)))
    .limit(1)
  if (!row) throw new Error(`Version id ${top.id} vanished mid-export`)
  return row
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("[kr1-fixture] DATABASE_URL required")
    process.exit(1)
  }

  const args = parseArgs(process.argv.slice(2))
  const db = getDb()
  const version = await pickVersion(args)

  const [master] = await db
    .select()
    .from(schema.mediaPlanMasters)
    .where(eq(schema.mediaPlanMasters.id, version.masterId))
    .limit(1)

  const lineItems = await db
    .select()
    .from(schema.lineItems)
    .where(eq(schema.lineItems.versionId, version.id))
    .orderBy(asc(schema.lineItems.position))

  const scheduleMonths = await db
    .select()
    .from(schema.scheduleMonths)
    .where(eq(schema.scheduleMonths.versionId, version.id))
    .orderBy(asc(schema.scheduleMonths.month), asc(schema.scheduleMonths.lineItemId))

  const [feeSnapshot] = await db
    .select()
    .from(schema.mbaFeeSnapshots)
    .where(eq(schema.mbaFeeSnapshots.versionId, version.id))
    .limit(1)

  const billingOverrides = await db
    .select()
    .from(schema.billingOverrides)
    .where(eq(schema.billingOverrides.versionId, version.id))

  const approvals = await db
    .select()
    .from(schema.mbaLineApprovals)
    .where(
      and(
        eq(schema.mbaLineApprovals.mbaNumber, version.mbaNumber),
        eq(schema.mbaLineApprovals.mediaPlanVersion, version.versionNumber)
      )
    )

  // "Aggregates" = schedule_months rollups (PG authority) + version frozen blobs.
  const byComponent = new Map<string, { component: string; basis: string; rows: number; amount_cents: number }>()
  const byMonth = new Map<string, { month: string; component: string; amount_cents: number }>()
  for (const row of scheduleMonths) {
    const ck = `${row.component}|${row.basis}`
    const c = byComponent.get(ck) ?? {
      component: row.component,
      basis: row.basis,
      rows: 0,
      amount_cents: 0,
    }
    c.rows += 1
    c.amount_cents += row.amountCents
    byComponent.set(ck, c)

    const mk = `${row.month}|${row.component}`
    const m = byMonth.get(mk) ?? {
      month: String(row.month),
      component: row.component,
      amount_cents: 0,
    }
    m.amount_cents += row.amountCents
    byMonth.set(mk, m)
  }
  const aggregates = {
    by_component: [...byComponent.values()],
    by_month: [...byMonth.values()],
    approved_slice: version.approvedSlice ?? null,
    legacy_schedules_present: version.legacySchedules != null,
  }

  const campaignKpi = await db
    .select()
    .from(schema.campaignKpi)
    .where(eq(schema.campaignKpi.mbaNumber, version.mbaNumber))
    .orderBy(desc(schema.campaignKpi.id))

  const fixture = {
    exported_at: new Date().toISOString(),
    source: {
      store: "postgres",
      project_ref: "slpdibnxtpdlttbbczvg",
      purpose: "KR-1 harness shape preserve before krusty/krabby purge",
    },
    selection: {
      mba_number: version.mbaNumber,
      version_number: version.versionNumber,
      version_id: version.id,
      master_id: version.masterId,
      args,
    },
    master: master ?? null,
    version,
    line_items: lineItems,
    schedule_months: scheduleMonths,
    aggregates,
    mba_fee_snapshots: feeSnapshot ?? null,
    billing_overrides: billingOverrides,
    mba_line_approvals: approvals,
    campaign_kpi: campaignKpi,
    counts: {
      line_items: lineItems.length,
      schedule_months: scheduleMonths.length,
      billing_overrides: billingOverrides.length,
      mba_line_approvals: approvals.length,
      campaign_kpi: campaignKpi.length,
    },
  }

  const outDir = path.join(process.cwd(), "scripts", "cutover", "fixtures")
  fs.mkdirSync(outDir, { recursive: true })
  const file = path.join(
    outDir,
    `krusty-complete-${version.mbaNumber}-v${version.versionNumber}.json`
  )
  fs.writeFileSync(file, JSON.stringify(fixture, null, 2) + "\n", "utf8")
  console.log(`[kr1-fixture] wrote ${file}`)
  console.log(`[kr1-fixture] counts`, fixture.counts)
}

main()
  .catch((err) => {
    console.error("[kr1-fixture] failed", err)
    process.exitCode = 1
  })
  .finally(async () => {
    await closeDb()
  })
