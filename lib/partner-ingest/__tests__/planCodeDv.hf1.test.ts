/**
 * HF1: Channel Factory accepts DV (Direct Booked Digital Video) plan codes.
 * Vistar keeps PV / PO only. Line names below are live RAW names (Snowflake
 * RAW.PARTNER_DELIVERY_DAILY, Channel Factory, 8 Nov 2026 load).
 */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import ExcelJS from "exceljs"

import { extractChannelFactoryPlanCode, extractPlanCode } from "../extractPlanCode"
import { CHANNEL_FACTORY_EXPECTED_HEADER } from "../columnNames"
import { readPartnerFileMatrix } from "../parsers"
import { parseChannelFactoryBuffer } from "../parsers/parseChannelFactory"
import { parseVistarBuffer, parseVistarMatrix } from "../parsers/parseVistar"

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures")

/** Names whose DV code is now read (Troye Holiday, PepperJack Anything Goes). */
const DV_LIVE_NAMES: Array<[string, string]> = [
  ["CF12_AT1_P25-44_PENFOLD020DV2", "penfold020dv2"],
  ["CF14_AT1_P25-44_PENFOLD020DV2", "penfold020dv2"],
  ["AT1_CF12_P25-64_TRWICO001DV1", "trwico001dv1"],
  ["AT1_CF14_P25-64_TRWICO001DV1", "trwico001dv1"],
  ["AT1_CF12_P25-64_TRWICO001DV2", "trwico001dv2"],
  ["AT1_CF14_P25-64_TRWICO001DV2", "trwico001dv2"],
]

/** Every other uncoded Channel Factory name in RAW on 8 Nov 2026. Must stay uncoded. */
const UNCODED_LIVE_NAMES = [
  "CF12_AT1_P25-64",
  "CF12_AT1_P25-64 (Female List)",
  "CF12_AT1_P25-64_Female List",
  "CF13_AT1_P35-99",
  "CF13_AT1_P35-99_2",
  "CF13_AT1_P35-99_3",
]

/** PV / PO inputs from the existing extractPlanCode tests. */
const PV_PO_CASES = [
  "CF12_AT1_P18-99_Birthday Hero_BICAU002PV4",
  "CF12_AT1_P25-64_3_Lux_PENFOLD018PV1",
  "CF14_AT1_P25-64__PENFOLD018PV1",
  "legal004PO1",
  "Contract LEGAL004PO12 / Jolt",
  "CF12_AT1_P25-64 (Female List)",
  "CF12_AT1_P25-64_1",
]

test("HF1: Channel Factory reads DV codes from the live Troye and PepperJack names", () => {
  for (const [name, code] of DV_LIVE_NAMES) {
    assert.equal(extractChannelFactoryPlanCode(name), code, name)
  }
})

test("HF1: the uncoded live Channel Factory names stay uncoded", () => {
  for (const name of UNCODED_LIVE_NAMES) {
    assert.equal(extractChannelFactoryPlanCode(name), null, name)
  }
})

test("HF1: Channel Factory PV and PO results match extractPlanCode exactly", () => {
  for (const name of PV_PO_CASES) {
    assert.equal(extractChannelFactoryPlanCode(name), extractPlanCode(name), name)
  }
  assert.equal(extractChannelFactoryPlanCode("CF12_AT1_P25-64_3_Lux_PENFOLD018PV1"), "penfold018pv1")
  assert.equal(extractChannelFactoryPlanCode("legal004PO1"), "legal004po1")
})

test("HF1: Channel Factory accepts DV only, not other direct or programmatic codes", () => {
  for (const name of [
    "CF12_AT1_P25-64_HARTM017DD1",
    "CF12_AT1_P25-64_TRWICO001DA1",
    "CF12_AT1_P25-64_HARTM017BV1",
    "CF12_AT1_P25-64_ABCD001PD1",
    "CF12_AT1_P25-64_ABCD001PB1",
    "CF12_AT1_P25-64_ABCD001SM1",
    "CF12_AT1_P25-64_PENFOLD020DV",
    "CF12_AT1_P25-64_PENFOLD20DV2",
  ]) {
    assert.equal(extractChannelFactoryPlanCode(name), null, name)
  }
})

test("HF1: Vistar extractPlanCode still rejects DV codes", () => {
  for (const [name] of DV_LIVE_NAMES) {
    assert.equal(extractPlanCode(name), null, name)
  }
  assert.equal(extractPlanCode("penfold020DV2"), null)
  assert.equal(extractPlanCode("Contract TRWICO001DV1"), null)
})

test("HF1: a Vistar Contract Number carrying a DV code still loads uncoded", async () => {
  const text = readFileSync(path.join(FIXTURES, "vistar-exchange-sample.csv"), "utf8")
  const lines = text.split(/\r?\n/)
  const preamble = lines.slice(0, 6)
  const header = lines[6]!
  const coded = lines[7]!.split(",")
  coded[5] = "penfold020DV2"
  const matrix = await readPartnerFileMatrix(
    Buffer.from([...preamble, header, coded.join(",")].join("\n"), "utf8"),
    "dv.csv"
  )
  const parsed = parseVistarMatrix(matrix)
  assert.equal(parsed.rows.length, 1)
  assert.equal(parsed.rows[0]?.avLineItemId, null)
})

test("HF1: Vistar fixture parses byte-identical to a5184377", async () => {
  const parsed = await parseVistarBuffer(
    readFileSync(path.join(FIXTURES, "vistar-exchange-sample.csv")),
    "vistar-exchange-sample.csv"
  )
  const json = JSON.stringify(parsed)
  assert.equal(json.length, 228_895)
  assert.equal(
    createHash("sha256").update(json).digest("hex"),
    "1e56d77b453eb0370d92f73c8ed92ef74bd5e8a8769a6272b9880d2f6b6d46f3"
  )
})

test("HF1: the Channel Factory parser codes a DV media buy and keeps PV and uncoded rows", async () => {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("Report")
  ws.addRow(["Datorama"])
  ws.addRow(["Report 1248052"])
  ws.addRow(CHANNEL_FACTORY_EXPECTED_HEADER.split("|"))
  const names = [
    "CF14_AT1_P25-44_PENFOLD020DV2",
    "CF12_AT1_P25-44_STRMEA001PV1",
    "CF12_AT1_P25-64 (Female List)",
  ]
  for (const name of names) {
    ws.addRow(["2026-10-21", "1", "OP079074_Troye", name, 1000, 1, 400, 0.9, 0.8, 0.7, 0.6])
  }
  const buffer = Buffer.from(await wb.xlsx.writeBuffer())
  const parsed = await parseChannelFactoryBuffer(buffer, "dv.xlsx")
  assert.deepEqual(
    parsed.rows.map((r) => r.avLineItemId),
    ["penfold020dv2", "strmea001pv1", null]
  )
  assert.equal(parsed.rows[0]?.completedViews, 600)
})
