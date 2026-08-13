import assert from "node:assert/strict"
import test from "node:test"
import type ExcelJS from "exceljs"

import {
  generateMediaPlan,
  type LineItem,
  type MediaItems,
  type MediaPlanHeader,
} from "@/lib/generateMediaPlan"

const HEADER: MediaPlanHeader = {
  logoBase64: "",
  logoWidth: 0,
  logoHeight: 0,
  client: "Test Client",
  brand: "Test Brand",
  campaignName: "Vertical Merge",
  mbaNumber: "MBA0001",
  clientContact: "Jane",
  planVersion: "1",
  poNumber: "PO1",
  campaignBudget: "100000",
  campaignStatus: "Approved",
  campaignStart: "01/01/2026",
  campaignEnd: "31/01/2026",
}

function emptyMedia(overrides: Partial<MediaItems> = {}): MediaItems {
  return {
    search: [],
    socialMedia: [],
    digiAudio: [],
    digiDisplay: [],
    digiVideo: [],
    bvod: [],
    progDisplay: [],
    progVideo: [],
    progBvod: [],
    progOoh: [],
    progAudio: [],
    newspaper: [],
    magazines: [],
    television: [],
    radio: [],
    ooh: [],
    cinema: [],
    integration: [],
    influencers: [],
    production: [],
    ...overrides,
  }
}

function tvLine(overrides: Partial<LineItem>): LineItem {
  return {
    market: "Sydney",
    network: "Seven",
    station: "ATN7",
    daypart: "Breakfast",
    placement: "In-Program",
    size: "30s",
    buyingDemo: "P25-54",
    buyType: "cpp",
    startDate: "2026-01-05",
    endDate: "2026-01-18",
    deliverables: 50,
    deliverablesAmount: "10000",
    grossMedia: "10000",
    ...overrides,
  }
}

function searchLine(overrides: Partial<LineItem>): LineItem {
  return {
    market: "National",
    platform: "Google",
    bidStrategy: "maximize_clicks",
    targeting: "Brand",
    creative: "RSA",
    buyingDemo: "All",
    buyType: "cpc",
    startDate: "2026-01-05",
    endDate: "2026-01-31",
    deliverables: 1000,
    deliverablesAmount: "5000",
    grossMedia: "5000",
    ...overrides,
  }
}

type ParsedMerge = {
  range: string
  startCol: number
  startRow: number
  endCol: number
  endRow: number
}

function colFromLetters(letters: string): number {
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n
}

function parseA1Range(range: string): ParsedMerge {
  const [a, b] = range.split(":")
  const end = b ?? a
  const parse = (ref: string) => {
    const m = /^([A-Z]+)(\d+)$/.exec(ref)
    if (!m) throw new Error(`bad A1 ref ${ref} in ${range}`)
    return { col: colFromLetters(m[1]!), row: Number(m[2]) }
  }
  const s = parse(a!)
  const e = parse(end)
  return {
    range,
    startCol: Math.min(s.col, e.col),
    startRow: Math.min(s.row, e.row),
    endCol: Math.max(s.col, e.col),
    endRow: Math.max(s.row, e.row),
  }
}

function worksheetMerges(ws: ExcelJS.Worksheet): ParsedMerge[] {
  const model = (ws as unknown as { model?: { merges?: string[] } }).model
  if (Array.isArray(model?.merges) && model.merges.length > 0) {
    return model.merges.map(parseA1Range)
  }
  const internal = (ws as unknown as { _merges?: Record<string, { range?: string } | string> })._merges
  if (internal && typeof internal === "object") {
    return Object.values(internal).flatMap((m) => {
      const range = typeof m === "string" ? m : m?.range
      return range ? [parseA1Range(range)] : []
    })
  }
  return []
}

function mediaPlanSheet(wb: ExcelJS.Workbook): ExcelJS.Worksheet {
  const sheet = wb.getWorksheet("Media Plan")
  assert.ok(sheet, "expected Media Plan worksheet")
  return sheet
}

function verticalMergesInCol(merges: ParsedMerge[], col: number): ParsedMerge[] {
  return merges.filter((m) => m.startCol === col && m.endCol === col && m.endRow > m.startRow)
}

function mergeContainsRow(m: ParsedMerge, row: number): boolean {
  return row >= m.startRow && row <= m.endRow
}

test("Television: identical Network cells merge in two runs split by the subtotal row", async () => {
  const workbook = await generateMediaPlan(
    HEADER,
    emptyMedia({
      television: [
        tvLine({ line_item_id: "TV1", daypart: "Breakfast" }),
        tvLine({ line_item_id: "TV2", daypart: "Daytime" }),
        tvLine({ line_item_id: "TV3", daypart: "Prime" }),
        tvLine({ line_item_id: "TV4", station: "HSV7", daypart: "Breakfast" }),
        tvLine({ line_item_id: "TV5", station: "HSV7", daypart: "Daytime" }),
      ],
    }),
  )
  const sheet = mediaPlanSheet(workbook)
  const merges = worksheetMerges(sheet)

  const subtotalRows: number[] = []
  for (let r = 1; r <= (sheet.rowCount || 80); r++) {
    if (String(sheet.getCell(r, 13).value ?? "") === "Subtotal ") subtotalRows.push(r)
  }
  assert.equal(subtotalRows.length, 2, `expected two Television subtotals, got ${subtotalRows.join(",")}`)
  const splitSubtotal = subtotalRows[0]!

  const networkMerges = verticalMergesInCol(merges, 3)
  assert.equal(
    networkMerges.length,
    2,
    `expected two Network merges, got ${networkMerges.map((m) => m.range).join(", ")}`,
  )
  const [first, second] = [...networkMerges].sort((a, b) => a.startRow - b.startRow)
  assert.equal(first!.endRow - first!.startRow + 1, 3)
  assert.equal(second!.endRow - second!.startRow + 1, 2)
  assert.ok(first!.endRow < splitSubtotal, "first Network merge must end before the subtotal")
  assert.ok(second!.startRow > splitSubtotal, "second Network merge must start after the subtotal")
  for (const m of networkMerges) {
    assert.ok(!mergeContainsRow(m, splitSubtotal), `${m.range} must not span the subtotal row`)
  }

  const master = sheet.getCell(first!.startRow, 3)
  assert.equal(master.alignment?.horizontal, "center")
  assert.equal(master.alignment?.vertical, "middle")
})

test("Search: Platform and Buy Type merge; Deliverables, Avg. Rate, Gross Media never merge", async () => {
  const workbook = await generateMediaPlan(
    HEADER,
    emptyMedia({
      search: [
        searchLine({ line_item_id: "SE1", targeting: "Brand" }),
        searchLine({ line_item_id: "SE2", targeting: "Generic" }),
      ],
    }),
  )
  const sheet = mediaPlanSheet(workbook)
  const merges = worksheetMerges(sheet)

  assert.ok(verticalMergesInCol(merges, 3).length >= 1, "Platform (col 3) should merge")
  assert.ok(verticalMergesInCol(merges, 12).length >= 1, "Buy Type (col 12) should merge")
  assert.equal(verticalMergesInCol(merges, 10).length, 0, "Deliverables (col 10) must never merge")
  assert.equal(verticalMergesInCol(merges, 13).length, 0, "Avg. Rate (col 13) must never merge")
  assert.equal(verticalMergesInCol(merges, 14).length, 0, "Gross Media (col 14) must never merge")
})

test("repeated identical Start/End dates merge in cols 7 and 8", async () => {
  const workbook = await generateMediaPlan(
    HEADER,
    emptyMedia({
      search: [
        searchLine({ line_item_id: "SE1", targeting: "Brand", startDate: "2026-01-05", endDate: "2026-01-31" }),
        searchLine({ line_item_id: "SE2", targeting: "Generic", startDate: "2026-01-05", endDate: "2026-01-31" }),
      ],
    }),
  )
  const sheet = mediaPlanSheet(workbook)
  const merges = worksheetMerges(sheet)
  assert.ok(verticalMergesInCol(merges, 7).length >= 1, "Start Date (col 7) should merge")
  assert.ok(verticalMergesInCol(merges, 8).length >= 1, "End Date (col 8) should merge")
  const startMerge = verticalMergesInCol(merges, 7)[0]!
  assert.equal(sheet.getCell(startMerge.startRow, 7).numFmt, "dd/mm/yyyy")
})

test("blank values never merge", async () => {
  const workbook = await generateMediaPlan(
    HEADER,
    emptyMedia({
      search: [
        searchLine({
          line_item_id: "SE1",
          targeting: "Brand",
          bidStrategy: "",
          buyingDemo: "",
          size: "",
        }),
        searchLine({
          line_item_id: "SE2",
          targeting: "Generic",
          bidStrategy: "",
          buyingDemo: "",
          size: "",
        }),
      ],
    }),
  )
  const sheet = mediaPlanSheet(workbook)
  const merges = worksheetMerges(sheet)
  assert.equal(verticalMergesInCol(merges, 4).length, 0, "empty Bid Strategy must not merge")
  assert.equal(verticalMergesInCol(merges, 9).length, 0, "empty Length/size must not merge")
  assert.equal(verticalMergesInCol(merges, 11).length, 0, "empty Buying Demo must not merge")
})

test("gantt burst merges remain on columns >= 15", async () => {
  const workbook = await generateMediaPlan(
    HEADER,
    emptyMedia({
      search: [
        searchLine({ line_item_id: "SE1", targeting: "Brand" }),
        searchLine({ line_item_id: "SE2", targeting: "Generic" }),
      ],
    }),
  )
  const sheet = mediaPlanSheet(workbook)
  const merges = worksheetMerges(sheet)
  const ganttMerges = merges.filter((m) => m.startCol >= 15 && m.endCol >= 15)
  assert.ok(ganttMerges.length > 0, "expected gantt/date-area merges to remain")
})

test("master cell of a descriptive merge is horizontally centered and vertically middle", async () => {
  const workbook = await generateMediaPlan(
    HEADER,
    emptyMedia({
      search: [
        searchLine({ line_item_id: "SE1", targeting: "Brand" }),
        searchLine({ line_item_id: "SE2", targeting: "Generic" }),
      ],
    }),
  )
  const sheet = mediaPlanSheet(workbook)
  const platformMerge = verticalMergesInCol(worksheetMerges(sheet), 3)[0]
  assert.ok(platformMerge, "expected a Platform merge")
  const master = sheet.getCell(platformMerge.startRow, 3)
  assert.equal(master.alignment?.horizontal, "center")
  assert.equal(master.alignment?.vertical, "middle")
  assert.equal(master.alignment?.wrapText, false)
})
