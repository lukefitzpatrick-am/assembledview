import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"

import ExcelJS from "exceljs"
import JSZip from "jszip"

import {
  AA_INSERTIONS_SHEET,
  AA_SUPPLIER_SHEET,
  aaFormatLabel,
  aaReadableLabel,
} from "../aaWorkbookSheets.js"
import { addKPISheet, generateMediaPlan } from "@/lib/generateMediaPlan"
import type { KPISheetRow, LineItem, MediaItems, MediaPlanHeader } from "@/lib/generateMediaPlan"
import { toCents } from "@/lib/money"

function emptyItems(): MediaItems {
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
  }
}

const header: MediaPlanHeader = {
  logoBase64: "",
  logoWidth: 0,
  logoHeight: 0,
  client: "Acme",
  brand: "Acme",
  campaignName: "Baseline",
  mbaNumber: "ACME001",
  clientContact: "",
  planVersion: "1",
  poNumber: "",
  campaignBudget: "$10,000.00",
  campaignStatus: "approved",
  campaignStart: "01/10/2026",
  campaignEnd: "30/11/2026",
}

const asOf = new Date("2026-10-19T00:00:00.000Z")

function baselineItems(): MediaItems {
  const items = emptyItems()
  items.ooh = [
    {
      market: "Sydney",
      network: "JCDecaux",
      oohFormat: "large_format",
      placement: "Road",
      size: "1",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      deliverables: 1,
      buyType: "panels",
      deliverablesAmount: "1000",
      grossMedia: "1000",
      line_item_id: "OH1",
      buyAmount: "1000",
    },
    {
      market: "Sydney",
      network: "oOh! media",
      oohFormat: "large_format",
      placement: "Rail",
      size: "1",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      deliverables: 1,
      buyType: "panels",
      deliverablesAmount: "500",
      grossMedia: "500",
      line_item_id: "OH2",
      buyAmount: "500",
    },
  ]
  items.radio = [
    {
      market: "Sydney",
      network: "Nova",
      station: "smoothfm",
      startDate: "2026-10-20",
      endDate: "2026-10-23",
      deliverables: 2,
      buyType: "bonus",
      deliverablesAmount: "0",
      grossMedia: "0",
      line_item_id: "RA1",
      buyAmount: "351",
    },
  ]
  return items
}

function line(opts: {
  network: string
  oohFormat?: string
  placement?: string
  station?: string
  start?: string
  end?: string
  deliverables?: number
  buyType?: string
  gross: string
  id: string
  rate: string
  platform?: string
  clientPays?: boolean
}): LineItem {
  return {
    market: "Sydney",
    network: opts.network,
    platform: opts.platform,
    oohFormat: opts.oohFormat,
    placement: opts.placement,
    station: opts.station,
    startDate: opts.start ?? "2026-10-01",
    endDate: opts.end ?? "2026-10-31",
    deliverables: opts.deliverables ?? 1,
    buyType: opts.buyType ?? "panels",
    deliverablesAmount: opts.gross,
    grossMedia: opts.gross,
    line_item_id: opts.id,
    buyAmount: opts.rate,
    clientPaysForMedia: opts.clientPays,
  }
}

const mba = {
  gross_media: [{ media_type: "OOH", gross_amount: 1500 }],
  totals: {
    gross_media: 1500,
    service_fee: 100,
    production: 0,
    adserving: 20,
    totals_ex_gst: 1620,
    total_inc_gst: 1782,
  },
}

const kpi: KPISheetRow = {
  mediaType: "ooh",
  publisher: "JCDecaux",
  label: "Road",
  buyType: "panels",
  spend: 1000,
  deliverables: 1,
  ctr: null,
  vtr: null,
  cpv: null,
  conversion_rate: null,
  frequency: null,
  calculatedClicks: null,
  calculatedViews: null,
  calculatedReach: null,
}

async function stableHash(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf)
  const names = Object.keys(zip.files).sort()
  const hash = createHash("sha256")
  for (const name of names) {
    if (name === "docProps/core.xml") continue
    const file = zip.files[name]
    if (!file || file.dir) continue
    hash.update(name)
    hash.update(await file.async("nodebuffer"))
  }
  return hash.digest("hex")
}

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value
  if (value == null) return ""
  if (typeof value === "string" || typeof value === "number") return String(value)
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "object" && "richText" in value) {
    return value.richText.map((part) => part.text).join("")
  }
  return String(value)
}

function findRow(sheet: ExcelJS.Worksheet, column: number, text: string): number {
  for (let row = 1; row <= sheet.rowCount; row++) {
    if (cellText(sheet.getCell(row, column)) === text) return row
  }
  return 0
}

function monthAmountOnPlan(sheet: ExcelJS.Worksheet, totalLabel: string, monthName: string): number {
  const row = findRow(sheet, 2, totalLabel)
  assert.ok(row > 0, `missing ${totalLabel}`)
  for (let col = 15; col <= sheet.columnCount; col++) {
    for (let above = row; above >= 1; above--) {
      const text = cellText(sheet.getCell(above, col))
      if (!text.startsWith(monthName)) continue
      const amount = sheet.getCell(row, col).value
      return typeof amount === "number" ? amount : 0
    }
  }
  throw new Error(`${monthName} not found for ${totalLabel}`)
}

test("non-AA workbooks stay byte-for-byte the same aside from the core timestamp", async () => {
  const standard = await generateMediaPlan(header, baselineItems(), mba, { asOf })
  const standardBuf = Buffer.from(await standard.xlsx.writeBuffer())
  assert.deepEqual(standard.worksheets.map((sheet) => sheet.name), ["Media Plan"])
  assert.equal(
    await stableHash(standardBuf),
    "ddd5b5da79188775a69ae72709ff2178f1174d740a210b79b45eb04e2a82314c",
  )

  const draft = await generateMediaPlan(header, baselineItems(), mba, { asOf, draft: true })
  const draftBuf = Buffer.from(await draft.xlsx.writeBuffer())
  assert.deepEqual(draft.worksheets.map((sheet) => sheet.name), ["Media Plan"])
  assert.equal(
    await stableHash(draftBuf),
    "2c0047dd7465677dd9f2f7b101da9e897a6399966634b7b911ce2134e002e323",
  )

  const withKpi = await generateMediaPlan(header, baselineItems(), mba, { asOf })
  addKPISheet(withKpi, [kpi], { publishers: [] })
  const kpiBuf = Buffer.from(await withKpi.xlsx.writeBuffer())
  assert.deepEqual(withKpi.worksheets.map((sheet) => sheet.name), ["Media Plan", "Campaign KPIs"])
  assert.equal(
    await stableHash(kpiBuf),
    "fbf9a4617d09aeba6e2ae8a592d583060a15d058917e341cb8c08b7765b3c798",
  )
})

test("AA monthly-by-supplier subtotals match the Media Plan months", async () => {
  const items = baselineItems()
  items.television = [
    line({
      network: "Nine",
      station: "Nine",
      start: "2026-10-18",
      end: "2026-10-18",
      buyType: "spots",
      gross: "200",
      id: "TV1",
      rate: "100",
      deliverables: 2,
    }),
  ]
  items.radio = [
    ...(items.radio ?? []),
    line({
      network: "Nova",
      station: "Nova 96.9",
      start: "2026-10-20",
      end: "2026-10-23",
      buyType: "spots",
      gross: "702",
      id: "RA2",
      rate: "351",
      deliverables: 2,
    }),
    line({
      network: "Nova",
      station: "Nova 96.9",
      start: "2026-10-31",
      end: "2026-11-06",
      buyType: "spots",
      gross: "702",
      id: "RA2",
      rate: "351",
      deliverables: 2,
    }),
  ]
  items.search = [
    line({
      network: "",
      platform: "Google Ads - AM",
      buyType: "cpc",
      gross: "100",
      id: "SE1",
      rate: "1",
      deliverables: 100,
    }),
  ]
  items.ooh = [
    ...(items.ooh ?? []),
    line({
      network: "QMS",
      oohFormat: "small_format",
      gross: "0",
      id: "OH9",
      rate: "0",
      buyType: "panels",
      clientPays: true,
      deliverables: 1,
    }),
  ]

  const workbook = await generateMediaPlan(header, items, mba, { asOf, mbaTotalsLayout: "aa" })
  assert.deepEqual(
    workbook.worksheets.map((sheet) => sheet.name),
    ["Media Plan", AA_SUPPLIER_SHEET, AA_INSERTIONS_SHEET],
  )

  const plan = workbook.getWorksheet("Media Plan")!
  const supplier = workbook.getWorksheet(AA_SUPPLIER_SHEET)!
  const headerRow = 1
  const monthCols = new Map<string, number>()
  for (let col = 1; col <= supplier.columnCount; col++) {
    const name = cellText(supplier.getCell(headerRow, col))
    if (name) monthCols.set(name, col)
  }

  const jc = supplierRow(supplier, "OOH", "JCDecaux")
  const ooh = supplierRow(supplier, "OOH", "oOh! media")
  assert.notEqual(jc, ooh)
  const october = monthCols.get("October 2026")!
  assert.equal(toCents(Number(supplier.getCell(jc, october).value)), toCents(1000))
  assert.equal(toCents(Number(supplier.getCell(ooh, october).value)), toCents(500))

  const subtotal = supplierRow(supplier, "OOH", "Subtotal")
  const planOoh = monthAmountOnPlan(plan, "Total OOH", "October 2026")
  assert.equal(toCents(Number(supplier.getCell(subtotal, october).value)), toCents(planOoh))

  for (const [label, planLabel] of [
    ["OOH", "Total OOH"],
    ["Television", "Total Television"],
    ["Radio", "Total Radio"],
    ["Search", "Total Search"],
  ] as const) {
    const sub = supplierRow(supplier, label, "Subtotal")
    for (const month of ["September 2026", "October 2026", "November 2026", "December 2026"]) {
      const col = monthCols.get(month)
      if (!col) continue
      const fromPlan = monthAmountOnPlan(plan, planLabel, month)
      assert.equal(
        toCents(Number(supplier.getCell(sub, col).value)),
        toCents(fromPlan),
        `${label} ${month}`,
      )
    }
  }

  const totalRow = findRow(supplier, 1, "Total")
  for (const month of ["September 2026", "October 2026", "November 2026", "December 2026"]) {
    const col = monthCols.get(month)
    if (!col) continue
    const fromPlan = monthAmountOnPlan(plan, "Total", month)
    assert.equal(
      toCents(Number(supplier.getCell(totalRow, col).value)),
      toCents(fromPlan),
      `grand ${month}`,
    )
  }

  const insertions = workbook.getWorksheet(AA_INSERTIONS_SHEET)!
  const insertionRows: string[][] = []
  for (let row = 2; row <= insertions.rowCount; row++) {
    const id = cellText(insertions.getCell(row, 1))
    if (!id) continue
    insertionRows.push([
      id,
      cellText(insertions.getCell(row, 2)),
      cellText(insertions.getCell(row, 3)),
      cellText(insertions.getCell(row, 4)),
      insertions.getCell(row, 5).numFmt,
      dateYmd(insertions.getCell(row, 7).value),
      String(insertions.getCell(row, 8).value),
      String(insertions.getCell(row, 9).value),
      String(insertions.getCell(row, 10).value),
      cellText(insertions.getCell(row, 11)),
    ])
  }
  assert.deepEqual(
    insertionRows.map((row) => row[0]),
    ["TV1", "RA1", "RA2", "RA2", "OH1", "OH2"],
  )
  assert.equal(insertionRows.some((row) => row[0] === "SE1"), false)
  assert.equal(insertionRows.some((row) => row[0] === "OH9"), false)

  const bonus = insertionRows.find((row) => row[0] === "RA1")!
  assert.equal(bonus[6], "351")
  assert.equal(bonus[7], "2")
  assert.equal(bonus[8], "0")
  assert.equal(bonus[9], "Yes")
  assert.equal(bonus[4], "d/mm/yyyy")
  assert.equal(bonus[5], "2026-10-19")

  const sunday = insertionRows.find((row) => row[0] === "TV1")!
  assert.equal(sunday[3], "Nine")
  assert.equal(sunday[5], "2026-10-12")

  const paid = insertionRows.filter((row) => row[0] === "RA2")
  assert.equal(paid.length, 2)
  assert.equal(paid[0]![6], "351")
  assert.equal(paid[0]![7], "2")
  assert.equal(paid[0]![8], "702")
  assert.equal(paid[0]![9], "")

  let bonusLabel = ""
  plan.eachRow((row) => {
    row.eachCell((cell) => {
      if (cellText(cell) === "Bonus") bonusLabel = "Bonus"
    })
  })
  assert.equal(bonusLabel, "Bonus")
})

function supplierRow(sheet: ExcelJS.Worksheet, media: string, supplier: string): number {
  for (let row = 2; row <= sheet.rowCount; row++) {
    if (cellText(sheet.getCell(row, 1)) === media && cellText(sheet.getCell(row, 2)) === supplier) {
      return row
    }
  }
  throw new Error(`missing ${media} / ${supplier}`)
}

function dateYmd(value: ExcelJS.CellValue): string {
  assert.ok(value instanceof Date, "expected a date")
  const year = value.getUTCFullYear()
  const month = String(value.getUTCMonth() + 1).padStart(2, "0")
  const day = String(value.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function sheetRows(sheet: ExcelJS.Worksheet, width: number): string[][] {
  const rows: string[][] = []
  for (let row = 1; row <= sheet.rowCount; row++) {
    const cells: string[] = []
    for (let col = 1; col <= width; col++) cells.push(cellText(sheet.getCell(row, col)))
    rows.push(cells)
  }
  return rows
}

test("aaReadableLabel turns codes into sentence case and leaves names alone", () => {
  assert.equal(aaReadableLabel("small_format"), "Small format")
  assert.equal(aaReadableLabel("street_furniture"), "Street furniture")
  assert.equal(aaReadableLabel("large_format"), "Large format")
  assert.equal(aaReadableLabel("transit"), "Transit")
  assert.equal(aaReadableLabel("Australian Financial Review"), "Australian Financial Review")
  assert.equal(aaReadableLabel("Nova 96.9"), "Nova 96.9")
  assert.equal(aaReadableLabel("Large Format"), "Large Format")
  assert.equal(aaReadableLabel(""), "")
  assert.equal(aaReadableLabel(undefined), "")
})

test("aaFormatLabel picks bid strategy, header2 or nothing by media type", () => {
  const base = line({ network: "JCDecaux", gross: "1", id: "X", rate: "1" })
  assert.equal(aaFormatLabel("ooh", { ...base, oohFormat: "street_furniture" }), "Street furniture")
  assert.equal(
    aaFormatLabel("newspaper", { ...base, title: "Australian Financial Review" }),
    "Australian Financial Review",
  )
  assert.equal(aaFormatLabel("radio", { ...base, station: "Nova 96.9" }), "Nova 96.9")
  assert.equal(aaFormatLabel("digiDisplay", { ...base, site: "news.com.au" }), "news.com.au")
  assert.equal(
    aaFormatLabel("search", { ...base, bidStrategy: "target_cpa", targeting: "Brand terms" }),
    "Target cpa",
  )
  const snake = { ...base, targeting: "Prospecting" } as LineItem & { bid_strategy?: string }
  snake.bid_strategy = "Maximise conversions"
  assert.equal(aaFormatLabel("progDisplay", snake), "Maximise conversions")
  assert.equal(aaFormatLabel("socialMedia", { ...base, targeting: "Lookalike" }), "")
  assert.equal(aaFormatLabel("production", { ...base, creative: "TVC edit" }), "")
})

test("aaFormatLabel is blank for integration, influencers and literal header2 fallbacks", () => {
  const base = line({ network: "", platform: "Acme Partners", gross: "1", id: "X", rate: "1" })
  const integration = { ...base, bidStrategy: "cpm", creative: "Hero" } as LineItem
  assert.equal(aaFormatLabel("integration", integration), "")
  assert.equal(aaFormatLabel("influencers", { ...base, bidStrategy: "cpv" } as LineItem), "")
  // Any media type on the getScheduleHeaders default branch reads blank, never "Details".
  assert.equal(aaFormatLabel("someOtherType", base), "")
  // A real header2 on the default branch still shows.
  assert.equal(aaFormatLabel("integration", { ...base, title: "Sponsored segment" } as LineItem), "Sponsored segment")
})

function mergeItems(oohFormats: string[], bids: string[]): MediaItems {
  const items = baselineItems()
  items.ooh = oohFormats.map((format, i) =>
    line({ network: "JCDecaux", oohFormat: format, gross: String(100 * (i + 1)), id: `OM${i}`, rate: "1" }),
  )
  items.search = bids.map((bid, i) => ({
    ...line({
      network: "",
      platform: "Google Ads - AM",
      buyType: "cpc",
      gross: String(10 * (i + 1)),
      id: `SM${i}`,
      rate: "1",
      deliverables: 10,
    }),
    bidStrategy: bid,
  }))
  items.integration = [
    line({ network: "", platform: "Acme Partners", buyType: "fixed_cost", gross: "75", id: "IN1", rate: "75" }),
  ]
  items.influencers = [
    line({ network: "", platform: "Creator Co", buyType: "fixed_cost", gross: "60", id: "IF1", rate: "60" }),
  ]
  return items
}

test("AA monthly-by-supplier merges formats that differ only in case or spacing", async () => {
  const mixed = await generateMediaPlan(
    header,
    mergeItems(["Large Format", "large_format", "  LARGE FORMAT "], ["Target CPA", "TARGET CPA ", "target cpa"]),
    mba,
    { asOf, mbaTotalsLayout: "aa" },
  )
  const uniform = await generateMediaPlan(
    header,
    mergeItems(["Large format", "Large format", "Large format"], ["Target CPA", "Target CPA", "Target CPA"]),
    mba,
    { asOf, mbaTotalsLayout: "aa" },
  )
  const sheet = mixed.getWorksheet(AA_SUPPLIER_SHEET)!
  const rows = sheetRows(sheet, 3)
  const totalCol = sheet.columnCount
  assert.deepEqual(
    rows.filter((row) => row[0] === "OOH"),
    [
      ["OOH", "JCDecaux", "Large format"],
      ["OOH", "Subtotal", ""],
    ],
  )
  // No code variant: the first-seen label wins.
  assert.deepEqual(
    rows.filter((row) => row[0] === "Search"),
    [
      ["Search", "Google Ads - AM", "Target CPA"],
      ["Search", "Subtotal", ""],
    ],
  )
  const oohRow = rows.findIndex((row) => row[0] === "OOH") + 1
  assert.equal(toCents(Number(sheet.getCell(oohRow, totalCol).value)), toCents(600))
  const searchRow = rows.findIndex((row) => row[0] === "Search") + 1
  assert.equal(toCents(Number(sheet.getCell(searchRow, totalCol).value)), toCents(60))

  assert.deepEqual(
    rows.filter((row) => row[0] === "Integration" || row[0] === "Influencers"),
    [
      ["Integration", "Acme Partners", ""],
      ["Integration", "Subtotal", ""],
      ["Influencers", "Creator Co", ""],
      ["Influencers", "Subtotal", ""],
    ],
  )
  assert.equal(rows.some((row) => row[2] === "Details"), false)

  // Every money cell matches the same plan with uniform labels: totals unchanged.
  const other = uniform.getWorksheet(AA_SUPPLIER_SHEET)!
  assert.equal(other.rowCount, sheet.rowCount)
  for (let r = 2; r <= sheet.rowCount; r++) {
    for (let c = 4; c <= totalCol; c++) {
      assert.equal(
        toCents(Number(sheet.getCell(r, c).value ?? 0)),
        toCents(Number(other.getCell(r, c).value ?? 0)),
        `row ${r} col ${c}`,
      )
    }
  }
  const insertions = mixed.getWorksheet(AA_INSERTIONS_SHEET)!
  const formatById = new Map<string, string>()
  for (let row = 2; row <= insertions.rowCount; row++) {
    formatById.set(cellText(insertions.getCell(row, 1)), cellText(insertions.getCell(row, 4)))
  }
  // Insertions stay one row per line with that line's own label.
  assert.equal(formatById.get("OM0"), "Large Format")
  assert.equal(formatById.get("OM1"), "Large format")
  assert.equal(formatById.get("OM2"), "LARGE FORMAT")
})

test("AA monthly-by-supplier splits each supplier by format, title or bid strategy", async () => {
  const items = baselineItems()
  items.ooh = [
    ...(items.ooh ?? []),
    line({
      network: "JCDecaux",
      oohFormat: "small_format",
      gross: "300",
      id: "OH3",
      rate: "300",
      buyType: "panels",
    }),
  ]
  items.search = [
    {
      ...line({
        network: "",
        platform: "Google Ads - AM",
        buyType: "cpc",
        gross: "100",
        id: "SE1",
        rate: "1",
        deliverables: 100,
      }),
      bidStrategy: "Maximise conversions",
      targeting: "Brand terms",
    },
    {
      ...line({
        network: "",
        platform: "Google Ads - AM",
        buyType: "cpc",
        gross: "40",
        id: "SE2",
        rate: "1",
        deliverables: 40,
      }),
      bidStrategy: "target_cpa",
      targeting: "Generic terms",
    },
  ]
  items.production = [
    {
      ...line({
        network: "Acme Studio",
        buyType: "production",
        gross: "250",
        id: "PR1",
        rate: "250",
      }),
      creative: "TVC edit",
    },
  ]

  const workbook = await generateMediaPlan(header, items, mba, { asOf, mbaTotalsLayout: "aa" })
  const supplier = workbook.getWorksheet(AA_SUPPLIER_SHEET)!
  const monthCount = supplier.columnCount - 4
  assert.deepEqual(sheetRows(supplier, 3)[0], ["Media type", "Supplier", "Format or title"])
  assert.equal(cellText(supplier.getCell(1, 4 + monthCount)), "Total")

  const rows = sheetRows(supplier, 3)
  const ooh = rows.filter((row) => row[0] === "OOH")
  assert.deepEqual(ooh, [
    ["OOH", "JCDecaux", "Large format"],
    ["OOH", "JCDecaux", "Small format"],
    ["OOH", "oOh! media", "Large format"],
    ["OOH", "Subtotal", ""],
  ])

  const totalCol = 4 + monthCount
  const oohStart = rows.findIndex((row) => row[0] === "OOH") + 1
  const sum = (from: number, count: number, col: number) => {
    let cents = 0
    for (let r = from; r < from + count; r++) cents += toCents(Number(supplier.getCell(r, col).value))
    return cents
  }
  for (let col = 4; col <= totalCol; col++) {
    assert.equal(
      sum(oohStart, 3, col),
      toCents(Number(supplier.getCell(oohStart + 3, col).value)),
      `OOH col ${col}`,
    )
  }
  assert.equal(toCents(Number(supplier.getCell(oohStart, totalCol).value)), toCents(1000))
  assert.equal(toCents(Number(supplier.getCell(oohStart + 1, totalCol).value)), toCents(300))
  assert.equal(toCents(Number(supplier.getCell(oohStart + 3, totalCol).value)), toCents(1800))

  const search = rows.filter((row) => row[0] === "Search")
  assert.deepEqual(search, [
    ["Search", "Google Ads - AM", "Maximise conversions"],
    ["Search", "Google Ads - AM", "Target cpa"],
    ["Search", "Subtotal", ""],
  ])
  assert.equal(rows.some((row) => row[2] === "Brand terms" || row[2] === "Generic terms"), false)

  const production = rows.filter((row) => row[0] === "Production")
  assert.deepEqual(production, [
    ["Production", "Acme Studio", ""],
    ["Production", "Subtotal", ""],
  ])

  const insertions = workbook.getWorksheet(AA_INSERTIONS_SHEET)!
  const formatById = new Map<string, string>()
  for (let row = 2; row <= insertions.rowCount; row++) {
    formatById.set(cellText(insertions.getCell(row, 1)), cellText(insertions.getCell(row, 4)))
  }
  assert.equal(formatById.get("OH1"), "Large format")
  assert.equal(formatById.get("OH3"), "Small format")
})
