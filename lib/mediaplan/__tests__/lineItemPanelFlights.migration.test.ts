/**
 * line_item_panel_flights migration 0027 — replay, cascade, live-in-month query.
 * Ephemeral schema; requires DIRECT_URL or DATABASE_URL (skips when unset / DNS fail).
 */
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import postgres from "postgres"

const SCHEMA = "line_item_panel_flights_mig_test"
const MIG_DIR = path.join(process.cwd(), "db", "migrations")
const PANELS = `${SCHEMA}.line_item_panels`
const FLIGHTS = `${SCHEMA}.line_item_panel_flights`

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

function rewritePublic(sqlText: string, table: string): string {
  return sqlText
    .replace(new RegExp(`public\\.${table}`, "g"), `${SCHEMA}.${table}`)
    .replace(
      new RegExp(`ON public\\.${table}`, "g"),
      `ON ${SCHEMA}.${table}`,
    )
    .replace(
      new RegExp(
        `REFERENCES public\\.line_item_panels\\(id\\)`,
        "g",
      ),
      `REFERENCES ${PANELS}(id)`,
    )
}

function panelsMigrationSql(): string {
  const raw = readFileSync(
    path.join(MIG_DIR, "0023_line_item_panels.sql"),
    "utf8",
  )
  return rewritePublic(raw, "line_item_panels")
}

function flightsMigrationSql(): string {
  const raw = readFileSync(
    path.join(MIG_DIR, "0027_line_item_panel_flights.sql"),
    "utf8",
  )
  return rewritePublic(raw, "line_item_panel_flights")
}

async function applyBoth(sql: postgres.Sql) {
  await sql.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
  await sql.unsafe(`CREATE SCHEMA ${SCHEMA}`)
  await sql.unsafe(panelsMigrationSql())
  await sql.unsafe(flightsMigrationSql())
}

test("migration chain includes 0027 after 0023", () => {
  const names = migrationFilenames()
  assert.ok(names.includes("0023_line_item_panels.sql"))
  assert.ok(names.includes("0027_line_item_panel_flights.sql"))
  assert.ok(
    names.indexOf("0027_line_item_panel_flights.sql") >
      names.indexOf("0023_line_item_panels.sql"),
  )
})

test("clean replay of 0027 creates line_item_panel_flights on empty schema", async (t) => {
  const url = loadUrl()
  if (!url) {
    t.skip("No DATABASE_URL/DIRECT_URL — skipping live migration replay")
    return
  }

  const sql = postgres(url, { prepare: false, max: 1, ssl: "require" })
  try {
    await applyBoth(sql)

    const tables = await sql.unsafe(`
      SELECT c.relname::text AS relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = '${SCHEMA}'
        AND c.relname = 'line_item_panel_flights'
        AND c.relkind = 'r'
    `)
    assert.equal(tables.length, 1)

    await sql.unsafe(flightsMigrationSql())
    const again = await sql.unsafe(`
      SELECT c.relname::text AS relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = '${SCHEMA}'
        AND c.relname = 'line_item_panel_flights'
        AND c.relkind = 'r'
    `)
    assert.equal(again.length, 1)

    const rls = await sql.unsafe(`
      SELECT c.relrowsecurity AS on
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = '${SCHEMA}' AND c.relname = 'line_item_panel_flights'
    `)
    assert.equal(rls[0]?.on, true)

    const money = await sql.unsafe(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = '${SCHEMA}'
        AND table_name = 'line_item_panel_flights'
        AND column_name ~* '(amount|spend|budget|fee|rate|money)'
    `)
    assert.equal(money.length, 0, "flights must carry no money columns")
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

test("cascade delete removes flights with the panel", async (t) => {
  const url = loadUrl()
  if (!url) {
    t.skip("No DATABASE_URL/DIRECT_URL — skipping cascade test")
    return
  }

  const sql = postgres(url, { prepare: false, max: 1, ssl: "require" })
  try {
    await applyBoth(sql)
    const [panel] = await sql.unsafe(`
      INSERT INTO ${PANELS} (line_item_id, mba_number, buy_granularity)
      VALUES ('casc1', 'bicau001', 'panel')
      RETURNING id
    `)
    const panelId = Number(panel.id)
    await sql.unsafe(`
      INSERT INTO ${FLIGHTS} (panel_id, period_start, period_end, is_live, is_bonus)
      VALUES
        (${panelId}, '2026-08-01', '2026-08-07', true, false),
        (${panelId}, '2026-08-15', '2026-08-21', true, true)
    `)
    let n = await sql.unsafe(
      `SELECT count(*)::int AS n FROM ${FLIGHTS} WHERE panel_id = ${panelId}`,
    )
    assert.equal(Number(n[0]?.n), 2)

    await sql.unsafe(`DELETE FROM ${PANELS} WHERE id = ${panelId}`)
    n = await sql.unsafe(
      `SELECT count(*)::int AS n FROM ${FLIGHTS} WHERE panel_id = ${panelId}`,
    )
    assert.equal(Number(n[0]?.n), 0)
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

test("live / dark / live round-trip; live-in-month query; bonus has no money", async (t) => {
  const url = loadUrl()
  if (!url) {
    t.skip("No DATABASE_URL/DIRECT_URL — skipping flight round-trip")
    return
  }

  const sql = postgres(url, { prepare: false, max: 1, ssl: "require" })
  try {
    await applyBoth(sql)
    const [panel] = await sql.unsafe(`
      INSERT INTO ${PANELS} (line_item_id, mba_number, buy_granularity)
      VALUES ('flt1', 'bicau001', 'panel')
      RETURNING id
    `)
    const panelId = Number(panel.id)

    // period1 live, period2 dark (no row), period3 live+bonus
    await sql.unsafe(`
      INSERT INTO ${FLIGHTS} (panel_id, period_start, period_end, is_live, is_bonus)
      VALUES
        (${panelId}, '2026-08-01', '2026-08-07', true, false),
        (${panelId}, '2026-08-15', '2026-08-21', true, true)
    `)

    const augustLive = await sql.unsafe(`
      SELECT p.line_item_id
      FROM ${FLIGHTS} f
      JOIN ${PANELS} p ON p.id = f.panel_id
      WHERE f.is_live = true
        AND f.period_start <= DATE '2026-08-31'
        AND f.period_end >= DATE '2026-08-01'
      ORDER BY f.period_start
    `)
    assert.equal(augustLive.length, 2)
    assert.ok(augustLive.every((r) => r.line_item_id === "flt1"))

    const week2 = await sql.unsafe(`
      SELECT count(*)::int AS n
      FROM ${FLIGHTS} f
      WHERE f.panel_id = ${panelId}
        AND f.is_live = true
        AND f.period_start <= DATE '2026-08-14'
        AND f.period_end >= DATE '2026-08-08'
    `)
    assert.equal(Number(week2[0]?.n), 0, "dark mid period must not match")

    const bonus = await sql.unsafe(`
      SELECT is_bonus, is_live
      FROM ${FLIGHTS}
      WHERE panel_id = ${panelId} AND period_start = DATE '2026-08-15'
    `)
    assert.equal(bonus[0]?.is_bonus, true)
    assert.equal(bonus[0]?.is_live, true)

    await assert.rejects(
      async () => {
        await sql.unsafe(`
          INSERT INTO ${FLIGHTS} (panel_id, period_start, period_end)
          VALUES (${panelId}, '2026-09-10', '2026-09-01')
        `)
      },
      /period|check/i,
      "period_end < period_start must fail",
    )
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
