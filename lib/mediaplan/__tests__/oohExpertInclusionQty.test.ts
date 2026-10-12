import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

import ExcelJS from "exceljs"

import { explodeExcelLineItems } from "@/lib/docs/explodeExcelLineItems"
import { buildMediaPlanWorkbook } from "@/lib/docs/mediaPlanWorkbook"
import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"
import {
  mapOohExpertRowsToStandardLineItems,
  mapStandardOohLineItemsToExpertRows,
  type StandardOohFormLineItem,
} from "@/lib/mediaplan/expertChannelMappings"
import type { OohExpertScheduleRow } from "@/lib/mediaplan/expertModeWeeklySchedule"
import type { MediaItems, MediaPlanHeader } from "@/lib/generateMediaPlan"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"

const CS = new Date(2026, 0, 4)
const CE = new Date(2026, 0, 31)

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

function expertRow(buyType: string, qty: number): OohExpertScheduleRow {
  const cols = buildWeeklyGanttColumnsFromCampaign(CS, CE)
  const weekKey = cols[0]!.weekKey
  return {
    id: "row-1",
    sourceLineItemId: "penfold026OH20",
    market: "SYD",
    network: "QMS",
    format: "street_furniture",
    type: "Static",
    placement: "Epping Road",
    startDate: "2026-01-04",
    endDate: "2026-01-10",
    size: "6x3",
    panels: "",
    buyingDemo: "P25-54",
    buyType,
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: false,
    unitRate: 250,
    grossCost: 0,
    weeklyValues: { [weekKey]: qty },
    mergedWeekSpans: [],
  }
}

function applyRow(buyType: string, qty: number) {
  const cols = buildWeeklyGanttColumnsFromCampaign(CS, CE)
  const [line] = mapOohExpertRowsToStandardLineItems([expertRow(buyType, qty)], cols, CS, CE, {
    feePctOoh: 10,
  })
  return { cols, line: line! }
}

function shownQty(row: OohExpertScheduleRow): number {
  let total = 0
  for (const value of Object.values(row.weeklyValues)) {
    if (typeof value === "number") total += value
  }
  for (const span of row.mergedWeekSpans ?? []) total += span.totalQty
  for (const value of Object.values(row.dailyValues ?? {})) {
    if (typeof value === "number") total += value
  }
  return total
}

test("OOH Expert Apply stores a package_inclusions week quantity and keeps money at 0", () => {
  const { line } = applyRow("package_inclusions", 4)
  const burst = line.bursts[0]!
  assert.equal(line.bursts.length, 1)
  assert.equal(burst.calculatedValue, 4)
  assert.equal(burst.budget, "0")
  assert.equal(burst.buyAmount, "0")
  assert.deepEqual(
    computeBurstAmounts({
      rawBudget: Number(burst.budget),
      budgetIncludesFees: false,
      clientPaysForMedia: false,
      feePct: 10,
      buyType: "package_inclusions",
    }),
    { mediaAmount: 0, deliveryMediaAmount: 0, feeAmount: 0, totalAmount: 0 },
  )
})

test("OOH Expert Apply stores a bonus week quantity and keeps money at 0", () => {
  const { line } = applyRow("bonus", 4)
  const burst = line.bursts[0]!
  assert.equal(burst.calculatedValue, 4)
  assert.equal(burst.budget, "0")
  assert.equal(burst.buyAmount, "0")
})

test("reopen shows the stored package_inclusions quantity", () => {
  const { cols, line } = applyRow("package_inclusions", 4)
  const [row] = mapStandardOohLineItemsToExpertRows([line], cols, CS, CE)
  assert.equal(shownQty(row!), 4)
})

test("a stored 0 package_inclusions quantity reopens as 0", () => {
  const cols = buildWeeklyGanttColumnsFromCampaign(CS, CE)
  const stored: StandardOohFormLineItem = {
    network: "QMS",
    format: "street_furniture",
    buyType: "package_inclusions",
    type: "Static",
    placement: "Epping Road",
    size: "6x3",
    buyingDemo: "P25-54",
    market: "SYD",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: false,
    noAdserving: false,
    lineItemId: "penfold026OH20",
    line_item_id: "penfold026OH20",
    line_item: 20,
    lineItem: 20,
    bursts: [
      {
        budget: "0",
        buyAmount: "0",
        startDate: new Date(2026, 0, 4),
        endDate: new Date(2026, 0, 10),
        calculatedValue: 0,
        buyType: "bonus",
      },
    ],
  }
  const [row] = mapStandardOohLineItemsToExpertRows([stored], cols, CS, CE)
  assert.ok(row)
  assert.equal(shownQty(row), 0)
  const spanQty = row.mergedWeekSpans?.[0]?.totalQty
  const weekQty = row.weeklyValues[cols[0]!.weekKey]
  assert.equal(spanQty ?? weekQty, 0)
})

test("media plan export shows the stored package_inclusions quantity in Deliverables and the flighting cell", async () => {
  const { line } = applyRow("package_inclusions", 4)
  const [exploded] = explodeExcelLineItems(
    "ooh",
    line as unknown as Record<string, unknown>,
    10,
    0,
    {
      campaignStart: CS,
      campaignEnd: CE,
    },
  )
  assert.equal(exploded!.deliverables, 4)
  assert.equal(Number(exploded!.grossMedia), 0)
  assert.equal(Number(exploded!.deliveryMediaAmount), 0)

  const header: MediaPlanHeader = {
    logoBase64: readFileSync(join(process.cwd(), "public/brand/logo-full-colour.png")).toString("base64"),
    logoWidth: 457,
    logoHeight: 71,
    client: "Penfold",
    brand: "Penfold",
    campaignName: "Inclusion spots",
    mbaNumber: "penfold026",
    clientContact: "",
    planVersion: "1",
    poNumber: "",
    campaignBudget: "$0.00",
    campaignStatus: "planned",
    campaignStart: "04/01/2026",
    campaignEnd: "31/01/2026",
  }
  const items = emptyItems()
  items.ooh = [exploded!]
  const built = await buildMediaPlanWorkbook({
    header,
    mediaItems: items,
    mbaData: {
      gross_media: [],
      totals: {
        gross_media: 0,
        service_fee: 0,
        production: 0,
        adserving: 0,
        totals_ex_gst: 0,
        total_inc_gst: 0,
      },
    },
    variant: "standard",
    draft: true,
    clientName: "Penfold",
    campaignName: "Inclusion spots",
    versionNumber: 1,
  })
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(built.buffer as unknown as ExcelJS.Buffer)
  const sheet = workbook.getWorksheet("Media Plan")
  assert.ok(sheet)

  let placementRow = 0
  sheet.eachRow((row, rowNumber) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.value === "Epping Road") placementRow = rowNumber
    })
  })
  assert.ok(placementRow > 0)

  let deliverablesCol = 0
  sheet.eachRow((row) => {
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (cell.value === "Deliverables" && deliverablesCol === 0) deliverablesCol = colNumber
    })
  })
  assert.equal(sheet.getCell(placementRow, deliverablesCol).value, 4)

  const flighting = sheet.getRow(placementRow).values
  const fours = (Array.isArray(flighting) ? flighting : []).filter((value) => value === 4)
  assert.ok(fours.length >= 2)
})
