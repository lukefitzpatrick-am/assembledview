/**
 * line_item_panels migration 0023 — schema/CHECK/cardinality tests.
 * Uses an ephemeral schema so replay does not touch public production tables.
 * Requires DIRECT_URL or DATABASE_URL (skips when unset).
 */
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import postgres from "postgres"

const SCHEMA = "line_item_panels_mig_test"
const MIG_DIR = path.join(process.cwd(), "db", "migrations")
const T = `${SCHEMA}.line_item_panels`

function loadUrl(): string | null {
  try {
    const env = readFileSync(path.join(process.cwd(), ".env.local"), "utf8")
    const pick = (key: string) => {
      const m =
        env.match(new RegExp(`${key}="([^"]+)"`)) ||
        env.match(new RegExp(`${key}=([^\\r\\n]+)`))
      return (m?.[1] || "").trim()
    }
    return pick("DIRECT_URL") || pick("DATABASE_URL") || null
  } catch {
    return null
  }
}

function migrationFilenames(): string[] {
  return readdirSync(MIG_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

function panelsMigrationSql(): string {
  const raw = readFileSync(path.join(MIG_DIR, "0023_line_item_panels.sql"), "utf8")
  return raw
    .replace(/public\.line_item_panels/g, T)
    .replace(/ON public\.line_item_panels/g, `ON ${T}`)
}

test("migration chain includes 0001 through 0023_line_item_panels", () => {
  const names = migrationFilenames()
  assert.ok(names.includes("0001_ported_tables.sql"))
  assert.ok(names.includes("0019_campaign_insights.sql"))
  assert.ok(names.includes("0020_clients_m365_identity.sql"))
  assert.ok(names.includes("0021_m365_provisioning_log.sql"))
  assert.ok(names.includes("0022_campaign_insights_ava_readonly.sql"))
  assert.ok(names.includes("0023_line_item_panels.sql"))
  const i19 = names.indexOf("0019_campaign_insights.sql")
  const i23 = names.indexOf("0023_line_item_panels.sql")
  assert.ok(i23 > i19)
})

test("clean replay of 0023 creates line_item_panels on empty schema", async (t) => {
  const url = loadUrl()
  if (!url) {
    t.skip("No DATABASE_URL/DIRECT_URL — skipping live migration replay")
    return
  }

  const sql = postgres(url, { prepare: false, max: 1, ssl: "require" })
  try {
    await sql.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
    await sql.unsafe(`CREATE SCHEMA ${SCHEMA}`)
    await sql.unsafe(panelsMigrationSql())

    const tables = await sql.unsafe(`
      SELECT c.relname::text AS relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = '${SCHEMA}'
        AND c.relname = 'line_item_panels'
        AND c.relkind = 'r'
    `)
    assert.equal(tables.length, 1)

    // Idempotent second apply
    await sql.unsafe(panelsMigrationSql())
    const again = await sql.unsafe(`
      SELECT c.relname::text AS relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = '${SCHEMA}'
        AND c.relname = 'line_item_panels'
        AND c.relkind = 'r'
    `)
    assert.equal(again.length, 1)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/ENOTFOUND|ECONNREFUSED|getaddrinfo/i.test(msg)) {
      t.skip(`DB unreachable: ${msg}`)
      return
    }
    throw err
  } finally {
    await sql.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).catch(() => {})
    await sql.end({ timeout: 5 })
  }
})

test("lowercase mba CHECK + buy_granularity + postcode + 500-panel cardinalities", async (t) => {
  const url = loadUrl()
  if (!url) {
    t.skip("No DATABASE_URL/DIRECT_URL — skipping live CHECK tests")
    return
  }

  const sql = postgres(url, { prepare: false, max: 1, ssl: "require" })
  try {
    await sql.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
    await sql.unsafe(`CREATE SCHEMA ${SCHEMA}`)
    await sql.unsafe(panelsMigrationSql())

    await assert.rejects(
      async () => {
        await sql.unsafe(`
          INSERT INTO ${T} (line_item_id, mba_number, buy_granularity)
          VALUES ('x1', 'BICAU001', 'panel')
        `)
      },
      /mba_number|line_item_panels_mba_number_lowercase|check/i,
      "uppercase mba_number must be rejected",
    )

    await assert.rejects(
      async () => {
        await sql.unsafe(`
          INSERT INTO ${T} (line_item_id, mba_number, buy_granularity)
          VALUES ('x1', 'bicau001', 'site')
        `)
      },
      /buy_granularity|line_item_panels_buy_granularity_check|check/i,
      "buy_granularity outside (panel,pack) must be rejected",
    )

    await sql.unsafe(`
      INSERT INTO ${T} (
        line_item_id, mba_number, buy_granularity, postcode, size
      ) VALUES (
        'bicau001ooh1', 'bicau001', 'panel', '0800', '12.48m x 3.20m'
      )
    `)
    const roundTrip = await sql.unsafe(`
      SELECT postcode, size FROM ${T}
      WHERE line_item_id = 'bicau001ooh1'
    `)
    assert.equal(roundTrip[0]?.postcode, "0800")
    assert.equal(roundTrip[0]?.size, "12.48m x 3.20m")

    const panelValues = Array.from({ length: 500 }, (_, i) => {
      const id = `lf${String(i + 1).padStart(4, "0")}`
      return `('${id}', 'bicau001', 'panel')`
    }).join(",\n")
    await sql.unsafe(`
      INSERT INTO ${T} (line_item_id, mba_number, buy_granularity)
      VALUES ${panelValues}
    `)
    const lfCount = await sql.unsafe(`
      SELECT count(*)::int AS n FROM ${T}
      WHERE buy_granularity = 'panel' AND line_item_id LIKE 'lf%'
    `)
    assert.equal(Number(lfCount[0]?.n), 500)

    const packValues = Array.from({ length: 500 }, (_, i) => {
      return `('pack-line-1', 'bicau001', 'pack', 'P${i + 1}')`
    }).join(",\n")
    await sql.unsafe(`
      INSERT INTO ${T} (
        line_item_id, mba_number, buy_granularity, panel_name
      ) VALUES ${packValues}
    `)
    const packCount = await sql.unsafe(`
      SELECT count(*)::int AS n FROM ${T}
      WHERE line_item_id = 'pack-line-1' AND buy_granularity = 'pack'
    `)
    assert.equal(Number(packCount[0]?.n), 500)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/ENOTFOUND|ECONNREFUSED|getaddrinfo/i.test(msg)) {
      t.skip(`DB unreachable: ${msg}`)
      return
    }
    throw err
  } finally {
    await sql.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).catch(() => {})
    await sql.end({ timeout: 5 })
  }
})
