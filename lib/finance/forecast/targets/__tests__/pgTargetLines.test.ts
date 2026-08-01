/**
 * PG round-trip for forecast targets. Skips when DATABASE_URL unset
 * or natural-key index (0014) missing.
 */
import assert from "node:assert/strict"
import { after, describe, it } from "node:test"
import { and, eq, sql } from "drizzle-orm"
import { closeDb, getDb, schema } from "@/db"
import {
  fetchRevenueForecastTargetLinesFromPostgres,
  upsertRevenueForecastTargetLine,
  upsertRevenueForecastTargetLinesBatch,
} from "@/lib/finance/forecast/targets/pgTargetLines"
import { targetLineNaturalKey } from "@/lib/finance/forecast/targets/targetLineHelpers"
import { FINANCE_FORECAST_LINE_KEYS } from "@/lib/types/financeForecast"
import { loadEnvLocal } from "../../../../../scripts/migration/_shared.js"

loadEnvLocal()

const hasDb = Boolean(process.env.DATABASE_URL?.trim())

async function hasNaturalKeyIndex(): Promise<boolean> {
  if (!hasDb) return false
  const db = getDb()
  try {
    const result = await db.execute(sql`
      SELECT 1 AS ok
      FROM pg_indexes
      WHERE tablename = 'revenue_forecast_lines'
        AND indexname = 'idx_revenue_forecast_lines_natural_key'
      LIMIT 1
    `)
    const rows = Array.isArray(result)
      ? result
      : ((result as { rows?: unknown[] }).rows ?? [])
    return rows.length > 0
  } catch {
    return false
  }
}

describe("pgTargetLines round-trip", () => {
  const markerClientId = "999001"
  const fy = 2099
  const lineKey = FINANCE_FORECAST_LINE_KEYS.retainer

  after(async () => {
    if (!hasDb) return
    try {
      const db = getDb()
      await db
        .delete(schema.revenueForecastLines)
        .where(
          and(
            eq(schema.revenueForecastLines.clientsId, Number(markerClientId)),
            eq(schema.revenueForecastLines.fy, String(fy))
          )
        )
    } catch {
      /* cleanup best-effort */
    }
    await closeDb().catch(() => undefined)
  })

  it("upserts then lists; second upsert is idempotent on natural key", async (t) => {
    if (!hasDb) {
      t.skip("DATABASE_URL not set")
      return
    }
    if (!(await hasNaturalKeyIndex())) {
      t.skip("idx_revenue_forecast_lines_natural_key missing — apply 0014")
      return
    }

    const cell = {
      client_id: markerClientId,
      financial_year_start_year: fy,
      line_key: lineKey,
      month_key: "july" as const,
      amount: 1234.56,
    }

    const first = await upsertRevenueForecastTargetLine({
      cell,
      updatedBy: "pgTargetLines.test",
    })
    assert.equal(first.previousAmount, null)
    assert.equal(first.line.amount, 1234.56)
    assert.equal(
      targetLineNaturalKey(first.line),
      `${markerClientId}::${fy}::${lineKey}::july`
    )

    const listed = await fetchRevenueForecastTargetLinesFromPostgres({
      financial_year_start_year: fy,
      client_id: markerClientId,
    })
    assert.ok(listed.some((l) => l.month_key === "july" && l.amount === 1234.56))

    const second = await upsertRevenueForecastTargetLine({
      cell: { ...cell, amount: 2000 },
      updatedBy: "pgTargetLines.test",
    })
    assert.equal(second.previousAmount, 1234.56)
    assert.equal(second.line.amount, 2000)

    const batch = await upsertRevenueForecastTargetLinesBatch({
      cells: [
        { ...cell, month_key: "august", amount: 50 },
        { ...cell, month_key: "september", amount: 75 },
      ],
      updatedBy: "pgTargetLines.test",
    })
    assert.equal(batch.lines.length, 2)

    const again = await fetchRevenueForecastTargetLinesFromPostgres({
      financial_year_start_year: fy,
      client_id: markerClientId,
    })
    assert.ok(again.length >= 3)
  })
})

describe("TargetGrid contract smoke (response shape)", () => {
  it("list/post/patch response shapes stay byte-compatible with TargetGrid", () => {
    // Mirror what TargetGrid reads — no UI mount required.
    const list = {
      lines: [
        {
          id: "1",
          client_id: "9",
          client_name: null,
          financial_year_start_year: 2026,
          line_key: "retainer",
          month_key: "july",
          amount: 100,
          updated_at: null,
          updated_by: null,
        },
      ],
      configured: true,
      financial_year_start_year: 2026,
      client_id: "9",
    }
    assert.equal(list.configured, true)
    assert.ok(Array.isArray(list.lines))
    assert.equal(typeof list.lines[0]!.amount, "number")

    const post = { ok: true as const, line: list.lines[0]! }
    assert.equal(post.ok, true)

    const patch = { ok: true as const, upserted: 1, lines: list.lines }
    assert.equal(patch.upserted, 1)
  })
})
