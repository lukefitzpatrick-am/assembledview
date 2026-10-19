import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"

import ExcelJS from "exceljs"
import JSZip from "jszip"

import { AA_INSERTIONS_SHEET, AA_SUPPLIER_SHEET } from "../aaWorkbookSheets.js"
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
