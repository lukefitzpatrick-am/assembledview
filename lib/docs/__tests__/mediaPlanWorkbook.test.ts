import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

import ExcelJS from "exceljs"

import {
  buildMediaPlanWorkbook,
  mediaPlanFileName,
} from "../mediaPlanWorkbook.js"
import type { KPISheetRow, LineItem, MediaItems, MediaPlanHeader } from "@/lib/generateMediaPlan"

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
  logoBase64: readFileSync(join(process.cwd(), "public/brand/logo-full-colour.png")).toString("base64"),
  logoWidth: 457,
  logoHeight: 71,
  client: "Acme",
  brand: "Acme",
  campaignName: "Spring push",
  mbaNumber: "ACME001",
  clientContact: "",
  planVersion: "3",
  poNumber: "",
  campaignBudget: "$1,000.00",
  campaignStatus: "planned",
  campaignStart: "01/01/2026",
  campaignEnd: "31/03/2026",
}

const mbaData = {
  gross_media: [],
  totals: {
    gross_media: 1000,
    service_fee: 150,
    production: 0,
    adserving: 0,
    totals_ex_gst: 1150,
    total_inc_gst: 1265,
  },
}

const kpi: KPISheetRow = {
  mediaType: "search",
  publisher: "google ads - am",
  label: "Brand",
  buyType: "cpc",
  spend: 1000,
  deliverables: 4800,
  ctr: 0.01,
  vtr: null,
  cpv: null,
  conversion_rate: null,
  frequency: null,
  calculatedClicks: 4800,
  calculatedViews: null,
  calculatedReach: null,
}

const spots: KPISheetRow = {
  mediaType: "television",
  publisher: "nova",
  label: "Spots",
  buyType: "spots",
  spend: 500,
  deliverables: 240,
  ctr: null,
  vtr: null,
  cpv: null,
  conversion_rate: null,
  frequency: null,
  calculatedClicks: null,
  calculatedViews: 10,
  calculatedReach: 200,
}

const publishers = [
  { publisherid: "google ads - am", publisher_name: "Google Ads" },
  { publisherid: "nova", publisher_name: "Nova" },
]

test("filenames follow the published and draft patterns", () => {
  assert.equal(
    mediaPlanFileName({
      clientName: "Acme",
      campaignName: "Spring push",
      versionNumber: 3,
      variant: "standard",
      draft: false,
    }),
    "Acme - Spring push - Media Plan - v3.xlsx",
  )
  assert.equal(
    mediaPlanFileName({
      clientName: "Acme",
      campaignName: "Spring push",
      versionNumber: 3,
      variant: "aa",
      draft: false,
    }),
    "Acme - Spring push - Media Plan (AA) - v3.xlsx",
  )
  assert.equal(
    mediaPlanFileName({
      clientName: "Acme",
      campaignName: "Spring push",
      versionNumber: 3,
      variant: "standard",
      draft: true,
    }),
    "DRAFT - Acme - Spring push - Media Plan - not for client.xlsx",
  )
})

test("draft and published share cells apart from the stamp, and AA skips the KPI sheet", async () => {
  const shared = {
    header,
    mediaItems: emptyItems(),
    mbaData,
    clientName: "Acme",
    campaignName: "Spring push",
    versionNumber: 3,
    kpiRows: [kpi, spots],
    publishers,
  }
  const published = await buildMediaPlanWorkbook({ ...shared, variant: "standard", draft: false })
  const draft = await buildMediaPlanWorkbook({ ...shared, variant: "standard", draft: true })
  const aa = await buildMediaPlanWorkbook({ ...shared, variant: "aa", draft: false })

  const publishedWb = new ExcelJS.Workbook()
  const draftWb = new ExcelJS.Workbook()
  const aaWb = new ExcelJS.Workbook()
  await publishedWb.xlsx.load(published.buffer as unknown as ExcelJS.Buffer)
  await draftWb.xlsx.load(draft.buffer as unknown as ExcelJS.Buffer)
  await aaWb.xlsx.load(aa.buffer as unknown as ExcelJS.Buffer)

  assert.equal(publishedWb.worksheets.length, 2)
  assert.equal(publishedWb.getWorksheet("Campaign KPIs") != null, true)
  assert.equal(draftWb.getWorksheet("Campaign KPIs") != null, true)
  assert.equal(aaWb.getWorksheet("Campaign KPIs"), undefined)

  const plan = publishedWb.getWorksheet("Media Plan")
  const kpis = publishedWb.getWorksheet("Campaign KPIs")
  assert.ok(plan)
  assert.ok(kpis)
  assert.equal(plan.pageSetup.orientation, "landscape")
  assert.equal(plan.pageSetup.fitToWidth, 1)
  assert.equal(plan.pageSetup.printTitlesRow, "1:8")
  assert.equal(kpis.pageSetup.orientation, "landscape")
  assert.equal(kpis.pageSetup.fitToWidth, 1)
  assert.equal(kpis.pageSetup.printTitlesRow, "1:1")
  assert.equal(plan.getCell("E4").value, 3)
  assert.equal(plan.getCell("G4").value, "Planned")

  const names: string[] = []
  let grandDeliverables: ExcelJS.CellValue = "missing"
  let grandSpend: ExcelJS.CellValue = "missing"
  let grandClicks: ExcelJS.CellValue = "missing"
  let grandViews: ExcelJS.CellValue = "missing"
  let grandReach: ExcelJS.CellValue = "missing"
  for (let r = 1; r <= kpis.rowCount; r++) {
    const label = String(kpis.getCell(r, 1).value ?? "")
    const publisher = String(kpis.getCell(r, 2).value ?? "")
    if (publisher) names.push(publisher)
    if (label === "Grand Total") {
      grandDeliverables = kpis.getCell(r, 6).value
      grandSpend = kpis.getCell(r, 5).value
      grandClicks = kpis.getCell(r, 11).value
      grandViews = kpis.getCell(r, 12).value
      grandReach = kpis.getCell(r, 13).value
    }
  }
  assert.deepEqual(names.filter((name) => name === "Google Ads" || name === "Nova"), [
    "Google Ads",
    "Nova",
  ])
  assert.equal(grandDeliverables ?? null, null)
  assert.equal(grandSpend, 1500)
  assert.equal(grandClicks, 4800)
  assert.equal(grandViews, 10)
  assert.equal(grandReach, 200)

  const publishedSheet = publishedWb.getWorksheet("Media Plan")
  const draftSheet = draftWb.getWorksheet("Media Plan")
  assert.equal(String(draftSheet?.headerFooter?.oddHeader ?? "").includes("DRAFT - NOT FOR CLIENT"), true)
  assert.equal(String(publishedSheet?.headerFooter?.oddHeader ?? "").includes("DRAFT - NOT FOR CLIENT"), false)
  assert.equal(draftSheet?.getCell(1, 1).value, "DRAFT")
})

function deliverablesDataCell(sheet: ExcelJS.Worksheet): ExcelJS.Cell {
  const headers: { row: number; col: number }[] = []
  sheet.eachRow((row, rowNumber) => {
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (cell.value === "Deliverables") headers.push({ row: rowNumber, col: colNumber })
    })
  })
  for (const headerCell of headers) {
    for (let r = headerCell.row + 1; r <= sheet.rowCount; r++) {
      const cell = sheet.getCell(r, headerCell.col)
      if (typeof cell.value === "number") return cell
    }
  }
  assert.fail("Deliverables data cell")
}

test("Deliverables data cells are left-aligned on the standard and AA files", async () => {
  const line: LineItem = {
    market: "National",
    platform: "Google",
    buyingDemo: "All",
    buyType: "cpc",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    deliverables: 1000,
    deliverablesAmount: "4000",
    grossMedia: "4000",
  }
  const shared = {
    header,
    mediaItems: { ...emptyItems(), search: [line] },
    mbaData,
    clientName: "Acme",
    campaignName: "Spring push",
    versionNumber: 3,
    kpiRows: [kpi],
    publishers,
  }
  for (const variant of ["standard", "aa"] as const) {
    const built = await buildMediaPlanWorkbook({ ...shared, variant, draft: false })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(built.buffer as unknown as ExcelJS.Buffer)
    const sheet = workbook.getWorksheet("Media Plan")
    assert.ok(sheet)
    const cell = deliverablesDataCell(sheet)
    assert.equal(cell.value, 1000)
    assert.equal(cell.numFmt, "#,##0")
    assert.equal(cell.alignment?.horizontal, "left")
    assert.equal(cell.alignment?.indent, 1)
    const buyingDemo = sheet.getCell(Number(cell.row), Number(cell.col) + 1)
    assert.equal(buyingDemo.value, "All")
    assert.equal(buyingDemo.alignment?.horizontal, "left")
    assert.equal(buyingDemo.alignment?.indent ?? 0, 0)
    const gross = sheet.getCell(Number(cell.row), Number(cell.col) + 4)
    assert.equal(gross.numFmt, "$#,##0.00")
    assert.equal(gross.alignment?.horizontal, "right")
  }
})
