/**
 * B31 FC9 (C1): the fixed cost margin report labels a dated line "Fixed cost
 * from [date]" on the line, the page and the Excel export. Billed, cost and
 * margin never move with the date, and with the switch off (no date on any
 * cell) the payload and the workbook are exactly as before.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { PgDialect } from "drizzle-orm/pg-core"

import {
  composeFixedCostMargin,
  FIXED_COST_FROM_NOTES,
  fixedCostFromFlagLabel,
  lineFlagLabels,
  summariseFixedCostMargin,
  type FixedCostMarginLine,
} from "../compose.js"
import { buildFixedCostMarginWorkbookBytes } from "../excel.js"
import { planCellFromRow, planCellsSql } from "../query.js"
import { BOSS_FROM, BOSS_RANGE, BOSS_TODAY_MARGIN_CENTS, bossPlan, bossSpend } from "./fixtures/bossFc9.js"

const here = dirname(fileURLToPath(import.meta.url))

function compose(fixedCostFrom?: string): FixedCostMarginLine[] {
  return composeFixedCostMargin({ plan: bossPlan(fixedCostFrom), spend: bossSpend(), invoiced: new Set(), ...BOSS_RANGE })
}

/** A dated line minus the FC9 keys, to compare with the switch-off line. */
function withoutFc9(lines: readonly FixedCostMarginLine[]): unknown {
  return JSON.parse(
    JSON.stringify(lines, (key, value) => (key === "fixedCostFrom" || key === "legs" || key === "fixedCostLegs" ? undefined : value)),
  )
}

test("label: 30 Oct 2026 reads 'Fixed cost from 30 Oct 2026'", () => {
  assert.equal(fixedCostFromFlagLabel("2026-10-30"), "Fixed cost from 30 Oct 2026")
  assert.equal(fixedCostFromFlagLabel("2026-11-01"), "Fixed cost from 1 Nov 2026")
})

test("switch off (no date on the cells): today's figures, no FC9 keys", () => {
  const lines = compose()
  assert.equal(lines.length, 4)
  for (const line of lines) {
    assert.equal("fixedCostFrom" in line, false)
    assert.ok(!lineFlagLabels(line).some((f) => f.startsWith("Fixed cost from")))
  }
  assert.equal(summariseFixedCostMargin(lines).grand.marginCents, BOSS_TODAY_MARGIN_CENTS)
})

test("dated line: carries the date and the label first; billed, cost and margin unchanged", () => {
  const off = compose()
  const on = compose(BOSS_FROM)
  for (const line of on) {
    assert.equal(line.fixedCostFrom, BOSS_FROM)
    assert.equal(lineFlagLabels(line)[0], "Fixed cost from 30 Oct 2026")
  }
  assert.deepEqual(withoutFc9(on), withoutFc9(off))
  assert.deepEqual(summariseFixedCostMargin(on), summariseFixedCostMargin(off))
  assert.equal(summariseFixedCostMargin(on).grand.marginCents, BOSS_TODAY_MARGIN_CENTS)
})

test("notes: the FC9 lines say the date moves no money, FC3 holds, legs add up, bills are label only", () => {
  // B31fix: a fourth note documents the prebilled and credit cases (L2, L3).
  assert.equal(FIXED_COST_FROM_NOTES.length, 4)
  assert.match(FIXED_COST_FROM_NOTES[3], /prebilled/)
  assert.match(FIXED_COST_FROM_NOTES[3], /credit \(negative billing\) in the date's month lands wholly on the Before leg/)
  assert.match(FIXED_COST_FROM_NOTES[0], /never changes a line's billed, cost or margin/)
  assert.match(FIXED_COST_FROM_NOTES[0], /Billing, true-up, accruals and Xero never read the date \(FC3\)/)
  assert.match(FIXED_COST_FROM_NOTES[1], /split by the FC6 rule/)
  assert.match(FIXED_COST_FROM_NOTES[1], /no line, month or report total changes/)
  assert.match(FIXED_COST_FROM_NOTES[2], /show the date only/)
  const query = readFileSync(join(here, "..", "query.ts"), "utf8")
  assert.match(query, /lines\.some\(\(l\) => l\.fixedCostFrom\) \? FIXED_COST_FROM_NOTES : \[\]/)
})

test("plan cell row: the date only with the switch on and only on a fixed cost media line", () => {
  const row = {
    client_id: 24,
    client_name: "Boss",
    mba_number: "BOSS010",
    line_item_id: "BOSS010PD1",
    fixed_cost_media: true,
    basis: "billing",
    month: "2026-10",
    amount_cents: "170000",
    fixed_cost_from: "2026-10-30",
  }
  assert.equal("fixedCostFrom" in planCellFromRow(row, false), false)
  assert.equal(planCellFromRow(row, true).fixedCostFrom, "2026-10-30")
  assert.equal("fixedCostFrom" in planCellFromRow({ ...row, fixed_cost_media: false }, true), false)
  assert.equal("fixedCostFrom" in planCellFromRow({ ...row, fixed_cost_from: null }, true), false)
  assert.equal("fixedCostFrom" in planCellFromRow({ ...row, fixed_cost_from: "2026-02-30" }, true), false)
  const { fixed_cost_from: _drop, ...noDate } = row
  assert.deepEqual(planCellFromRow(row, false), planCellFromRow(noDate, false))
})

test("plan cells SQL: off is the old text; on adds only the date column and its GROUP BY", () => {
  const dialect = new PgDialect()
  const off = dialect.sqlToQuery(planCellsSql({ clientIds: [] }, false))
  const on = dialect.sqlToQuery(planCellsSql({ clientIds: [] }, true))
  assert.doesNotMatch(off.sql, /fixed_cost_from/)
  assert.match(off.sql, /AS amount_cents\n    FROM media_plan_masters m/)
  assert.match(off.sql, /GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14\n/)
  assert.match(on.sql, /AS amount_cents,\n      li\.fixed_cost_from::text AS fixed_cost_from\n    FROM/)
  // B31fix2 H1: the date is grouped by name. `, 15` grouped by the SUM (Postgres 42803).
  assert.match(on.sql, /GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, li\.fixed_cost_from\n/)
  assert.equal(
    on.sql.replace(",\n      li.fixed_cost_from::text AS fixed_cost_from", "").replace("13, 14, li.fixed_cost_from\n", "13, 14\n"),
    off.sql,
  )
  assert.deepEqual(on.params, off.params)
})

test("Excel: the flags column carries the date label; an undated workbook is unchanged", async () => {
  const ExcelJS = (await import("exceljs")).default
  async function sheetValues(lines: FixedCostMarginLine[]): Promise<Record<string, unknown[][]>> {
    const bytes = await buildFixedCostMarginWorkbookBytes(lines, summariseFixedCostMargin(lines), ["n"])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(bytes)
    const out: Record<string, unknown[][]> = {}
    for (const ws of wb.worksheets) {
      const rows: unknown[][] = []
      ws.eachRow({ includeEmpty: true }, (row) => rows.push(JSON.parse(JSON.stringify(row.values))))
      out[ws.name] = rows
    }
    return out
  }
  const off = await sheetValues(compose())
  const on = await sheetValues(compose(BOSS_FROM))
  const header = off["Line months"]![0] as unknown[]
  const flagsCol = header.indexOf("Flags")
  assert.ok(flagsCol > 0)
  for (const row of on["Line months"]!.slice(1)) {
    assert.match(String(row[flagsCol]), /^Fixed cost from 30 Oct 2026/)
  }
  for (const row of off["Line months"]!.slice(1)) {
    assert.doesNotMatch(String(row[flagsCol] ?? ""), /Fixed cost from/)
  }
  // Only the flags cells differ between the two Line months sheets.
  const strip = (rows: unknown[][]) => rows.map((r) => r.filter((_, i) => i !== flagsCol))
  assert.deepEqual(strip(on["Line months"]!), strip(off["Line months"]!))
  for (const name of ["By client", "By publisher", "By month", "Billed vs delivered"]) {
    assert.deepEqual(on[name], off[name], name)
  }
})
