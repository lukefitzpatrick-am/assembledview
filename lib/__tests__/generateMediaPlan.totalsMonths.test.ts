import assert from "node:assert/strict"
import test from "node:test"

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
  campaignName: "Totals months",
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

function searchLine(overrides: Partial<LineItem>): LineItem {
  return {
    market: "National",
    platform: "Google",
    bidStrategy: "maximize_clicks",
    targeting: "Brand",
    creative: "RSA",
    buyingDemo: "All",
    buyType: "cpc",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    deliverables: 1000,
    deliverablesAmount: "4000",
    grossMedia: "4000",
    ...overrides,
  }
}

function sumTotalRowMonths(sheet: import("exceljs").Worksheet): number {
  let totalRow = 0
  sheet.eachRow((row, rowNumber) => {
    const label = String(row.getCell(2).value ?? "")
    if (label === "Total") totalRow = rowNumber
  })
  assert.ok(totalRow > 0, "Total row")
  let sum = 0
  const row = sheet.getRow(totalRow)
  row.eachCell({ includeEmpty: false }, (cell, col) => {
    if (col < 15 || typeof cell.value !== "number") return
    const master = (cell as { master?: { address?: string } }).master
    if (master?.address && master.address !== cell.address) return
    sum += cell.value
  })
  const columnN = sheet.getRow(totalRow).getCell(14).value
  assert.equal(typeof columnN, "number")
  assert.ok(Math.abs(sum - (columnN as number)) < 0.02, `months ${sum} vs N ${columnN}`)
  return sum
}

test("Total row months include production and sum to Total Ex GST", async () => {
  const workbook = await generateMediaPlan(
    HEADER,
    emptyMedia({
      search: [
        searchLine({ grossMedia: "4000", deliverablesAmount: "4000" }),
        searchLine({ grossMedia: "3000", deliverablesAmount: "3000", platform: "Bing" }),
      ],
      production: [
        searchLine({
          grossMedia: "2000",
          deliverablesAmount: "2000",
          platform: "Studio",
        }),
      ],
    }),
    {
      gross_media: [{ media_type: "Search", gross_amount: 7000 }],
      totals: {
        gross_media: 7000,
        service_fee: 0,
        production: 2000,
        adserving: 0,
        totals_ex_gst: 9000,
        total_inc_gst: 9900,
      },
    },
  )
  const sheet = workbook.getWorksheet("Media Plan")
  assert.ok(sheet)
  assert.equal(sumTotalRowMonths(sheet), 9000)
})

test("a burst past the campaign end keeps its month and the remainder", async () => {
  const workbook = await generateMediaPlan(
    HEADER,
    emptyMedia({
      search: [
        searchLine({
          startDate: "2026-01-22",
          endDate: "2026-02-10",
          grossMedia: "2000",
          deliverablesAmount: "2000",
        }),
      ],
    }),
    {
      gross_media: [{ media_type: "Search", gross_amount: 2000 }],
      totals: {
        gross_media: 2000,
        service_fee: 0,
        production: 0,
        adserving: 0,
        totals_ex_gst: 2000,
        total_inc_gst: 2200,
      },
    },
  )
  const sheet = workbook.getWorksheet("Media Plan")
  assert.ok(sheet)
  let sawFebruary = false
  sheet.eachRow((row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (!String(cell.value).startsWith("February 2026")) return
      sawFebruary = true
      assert.match(String(cell.value), /Outside campaign dates/)
    })
  })
  assert.equal(sawFebruary, true)
  assert.equal(sumTotalRowMonths(sheet), 2000)
})
