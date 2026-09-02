import assert from "node:assert/strict"
import test from "node:test"
import {
  capParseForTransport,
  TRANSPORT_BLOCK_CAP,
  TRANSPORT_LABEL_CAP,
  TRANSPORT_ROW_CAP,
} from "../capParseForTransport.js"
import type { RmBlock, RmDataRow, RmSheet, RmWorkbookParse } from "../royMorganTypes.js"

function row(label: string, rowIndex: number): RmDataRow {
  return {
    section: null,
    label,
    rowIndex,
    wc: 1,
    reachPct: 0.1,
    index: 100,
    suppressed: false,
  }
}

function block(blockId: string, rows: RmDataRow[]): RmBlock {
  return {
    blockId,
    columnName: "Audience",
    isBase: false,
    labelCol: 1,
    metrics: ["wc"],
    unweightedN: 10,
    popn000: 100,
    rows,
  }
}

function parseOf(blocks: RmBlock[]): RmWorkbookParse {
  const sheet: RmSheet = {
    sheetName: "Run",
    waveCode: "JAN26A_NAT",
    surveyPeriod: null,
    filter: null,
    weights: null,
    blocks,
    skipped: [],
  }
  return { fileName: "t.xlsx", sheets: [sheet], warnings: [] }
}

test("capParseForTransport leaves a small parse unchanged", () => {
  const parse = parseOf([block("b1", [row("TV", 1)])])
  const out = capParseForTransport(parse)
  assert.deepEqual(out.cap_hit, [])
  assert.equal(out.parse.sheets[0]!.blocks.length, 1)
  assert.equal(out.parse.sheets[0]!.blocks[0]!.rows[0]!.label, "TV")
})

test("capParseForTransport caps blocks at 40 and reports blocks", () => {
  const blocks = Array.from({ length: TRANSPORT_BLOCK_CAP + 3 }, (_, i) =>
    block(`b${i}`, [row("TV", 1)])
  )
  const out = capParseForTransport(parseOf(blocks))
  assert.ok(out.cap_hit.includes("blocks"))
  assert.equal(out.parse.sheets[0]!.blocks.length, TRANSPORT_BLOCK_CAP)
})

test("capParseForTransport caps rows at 1500 per block and reports rows", () => {
  const rows = Array.from({ length: TRANSPORT_ROW_CAP + 8 }, (_, i) => row(`r${i}`, i))
  const out = capParseForTransport(parseOf([block("b1", rows)]))
  assert.ok(out.cap_hit.includes("rows"))
  assert.equal(out.parse.sheets[0]!.blocks[0]!.rows.length, TRANSPORT_ROW_CAP)
})

test("capParseForTransport truncates labels to 200 chars and reports labels", () => {
  const long = "x".repeat(TRANSPORT_LABEL_CAP + 20)
  const out = capParseForTransport(parseOf([block("b1", [row(long, 1)])]))
  assert.ok(out.cap_hit.includes("labels"))
  assert.equal(out.parse.sheets[0]!.blocks[0]!.rows[0]!.label.length, TRANSPORT_LABEL_CAP)
})

test("capParseForTransport does not mutate the input parse", () => {
  const rows = Array.from({ length: TRANSPORT_ROW_CAP + 1 }, (_, i) => row(`r${i}`, i))
  const parse = parseOf([block("b1", rows)])
  capParseForTransport(parse)
  assert.equal(parse.sheets[0]!.blocks[0]!.rows.length, TRANSPORT_ROW_CAP + 1)
})
