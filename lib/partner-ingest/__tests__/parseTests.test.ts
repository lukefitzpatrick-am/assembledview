import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

import { CHANNEL_FACTORY_EXPECTED_HEADER, VISTAR_EXPECTED_HEADER } from "../columnNames"
import { runPartnerFileParseTests } from "../parseTests"
import { readPartnerFileMatrix } from "../parsers"
import { parsePartnerFileMatrix } from "../parsers/parseChannelFactory"
import { parseVistarMatrix } from "../parsers/parseVistar"

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures")
const VISTAR_CSV = path.join(FIXTURES, "vistar-exchange-sample.csv")
const CF_XLSX = path.join(FIXTURES, "channel-factory-2026-09-14.xlsx")

async function vistarMatrix(text?: string): Promise<unknown[][]> {
  const buffer = text == null ? readFileSync(VISTAR_CSV) : Buffer.from(text, "utf8")
  return readPartnerFileMatrix(buffer, "vistar-exchange-sample.csv")
}

/** Rewrites the trailing totals row so T6 can be pushed outside tolerance. */
function doctoredTotals(scale: { impressions?: number; revenue?: number }): string {
  const lines = readFileSync(VISTAR_CSV, "utf8").replace(/\r?\n$/, "").split(/\r?\n/)
  const totals = lines[lines.length - 1]!.split(",")
  if (scale.impressions != null) {
    totals[14] = String(Number(totals[14]) * scale.impressions)
  }
  if (scale.revenue != null) {
    totals[16] = String(Number(totals[16]) * scale.revenue)
  }
  lines[lines.length - 1] = totals.join(",")
  return lines.join("\n")
}

test("T6 passes on the Vistar fixture totals row", async () => {
  const matrix = await vistarMatrix()
  const parsed = parseVistarMatrix(matrix)
  const tests = runPartnerFileParseTests(parsed, VISTAR_EXPECTED_HEADER, matrix)
  assert.equal(tests.t1.ok, true)
  assert.equal(tests.t6?.ok, true)
  assert.equal(tests.failed, false)
  assert.ok((tests.t6?.value ?? 1) < 0.005)
})

test("T6 fails when the totals impressions do not reconcile", async () => {
  const matrix = await vistarMatrix(doctoredTotals({ impressions: 1.05 }))
  const parsed = parseVistarMatrix(matrix)
  const tests = runPartnerFileParseTests(parsed, VISTAR_EXPECTED_HEADER, matrix)
  assert.equal(tests.t6?.ok, false)
  assert.equal(tests.failed, true)
  assert.match(tests.t6?.detail ?? "", /impressions/i)
})

test("T6 fails when the totals revenue does not reconcile", async () => {
  const matrix = await vistarMatrix(doctoredTotals({ revenue: 1.2 }))
  const parsed = parseVistarMatrix(matrix)
  const tests = runPartnerFileParseTests(parsed, VISTAR_EXPECTED_HEADER, matrix)
  assert.equal(tests.t6?.ok, false)
  assert.match(tests.t6?.detail ?? "", /revenue/i)
})

test("T4 and T5 are n/a for a source with no video columns", async () => {
  const matrix = await vistarMatrix()
  const parsed = parseVistarMatrix(matrix)
  const tests = runPartnerFileParseTests(parsed, VISTAR_EXPECTED_HEADER, matrix)
  assert.equal(tests.t4.ok, true)
  assert.equal(tests.t5.ok, true)
  assert.match(tests.t4.detail, /n\/a/)
  assert.match(tests.t5.detail, /n\/a/)
})

test("T6 is n/a for the Channel Factory file, which has no totals row", async () => {
  const matrix = await readPartnerFileMatrix(
    readFileSync(CF_XLSX),
    "channel-factory-2026-09-14.xlsx"
  )
  const parsed = parsePartnerFileMatrix(matrix)
  const tests = runPartnerFileParseTests(parsed, CHANNEL_FACTORY_EXPECTED_HEADER, matrix)
  assert.equal(tests.t6?.ok, true)
  assert.match(tests.t6?.detail ?? "", /n\/a/)
  assert.equal(tests.failed, false)
})
