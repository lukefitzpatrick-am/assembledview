import assert from "node:assert/strict"
import test from "node:test"

import { addGst } from "@/lib/finance/gst"
import {
  generateMediaPlan,
  type LineItem,
  type MediaItems,
  type MediaPlanHeader,
} from "@/lib/generateMediaPlan"
import { buildAdvertisingAssociatesMbaDataFromMediaItems } from "@/lib/mediaplan/advertisingAssociatesExcel"
import { fromCents, toCents } from "@/lib/money"

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

test("a client-pays row shows net media, and the AA row is zero", async () => {
  const line = searchLine({
    grossMedia: "0",
    deliverablesAmount: "12500",
    deliveryMediaAmount: "10000",
    clientPaysForMedia: true,
    budgetIncludesFees: true,
  })
  const standard = await generateMediaPlan(HEADER, emptyMedia({ search: [line] }), {
    gross_media: [],
    totals: {
      gross_media: 10000,
      service_fee: 2500,
      production: 0,
      adserving: 0,
      totals_ex_gst: 12500,
      total_inc_gst: 13750,
    },
  })
  const standardSheet = standard.getWorksheet("Media Plan")
  assert.ok(standardSheet)
  let clientPaysGross: unknown = null
  standardSheet.eachRow((row) => {
    if (String(row.getCell(2).value ?? "") === "National") {
      clientPaysGross = row.getCell(14).value
    }
  })
  assert.equal(clientPaysGross, 10000)

  const aa = await generateMediaPlan(
    HEADER,
    emptyMedia({ search: [line, searchLine({ grossMedia: "5000", deliverablesAmount: "5000" })] }),
    {
      gross_media: [{ media_type: "Search", gross_amount: 5000 }],
      totals: {
        gross_media: 5000,
        service_fee: 0,
        production: 0,
        adserving: 0,
        totals_ex_gst: 5000,
        total_inc_gst: 5500,
      },
    },
    { mbaTotalsLayout: "aa" },
  )
  const aaSheet = aa.getWorksheet("Media Plan")
  assert.ok(aaSheet)
  let totalN = 0
  aaSheet.eachRow((row) => {
    if (String(row.getCell(2).value ?? "") === "Total") {
      totalN = Number(row.getCell(14).value)
    }
  })
  assert.equal(totalN, 5000)
  assert.equal(sumTotalRowMonths(aaSheet), 5000)
  let aaNationalGross: number[] = []
  aaSheet.eachRow((row) => {
    if (String(row.getCell(2).value ?? "") !== "National") return
    const gross = row.getCell(14).value
    if (typeof gross === "number") aaNationalGross.push(gross)
  })
  assert.deepEqual(aaNationalGross, [5000])
})

test("plan date is the Sydney civil date and an invalid end stays blank", async () => {
  const workbook = await generateMediaPlan(
    { ...HEADER, campaignEnd: "not-a-date", campaignBudgetCents: 123456 },
    emptyMedia(),
    undefined,
    { asOf: new Date("2026-10-07T22:30:00Z") },
  )
  const sheet = workbook.getWorksheet("Media Plan")
  assert.ok(sheet)
  const planDate = sheet.getCell("E5").value
  assert.ok(planDate instanceof Date)
  assert.equal(planDate.getUTCFullYear(), 2026)
  assert.equal(planDate.getUTCMonth(), 9)
  assert.equal(planDate.getUTCDate(), 8)
  assert.equal(sheet.getCell("G6").value, null)
  assert.equal(sheet.getCell("G3").value, 1234.56)
})

function cinemaLine(overrides: Partial<LineItem>): LineItem {
  return {
    market: "National",
    network: "Val Morgan",
    station: "Hoyts",
    placement: "Pre-show",
    format: "30s",
    buyingDemo: "All",
    buyType: "screens",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    deliverables: 10,
    deliverablesAmount: "50000",
    grossMedia: "50000",
    ...overrides,
  }
}

function cinemaAvgRate(sheet: import("exceljs").Worksheet, station: string): unknown {
  let rate: unknown = "missing"
  sheet.eachRow((row) => {
    if (String(row.getCell(4).value ?? "") !== station) return
    rate = row.getCell(13).value
  })
  return rate
}

test("cinema Avg. Rate is gross divided by screens", async () => {
  const workbook = await generateMediaPlan(
    HEADER,
    emptyMedia({
      cinema: [
        cinemaLine({ station: "Hoyts", deliverables: 10, grossMedia: "50000" }),
        cinemaLine({ station: "Event", deliverables: 0, grossMedia: "50000" }),
        cinemaLine({ station: "Village", deliverables: undefined, grossMedia: "50000" }),
      ],
    }),
  )
  const sheet = workbook.getWorksheet("Media Plan")
  assert.ok(sheet)
  assert.equal(cinemaAvgRate(sheet, "Hoyts"), 5000)
  assert.equal(cinemaAvgRate(sheet, "Event"), null)
  assert.equal(cinemaAvgRate(sheet, "Village"), null)
})

test("AA inc GST uses addGst on the cents total", () => {
  const data = buildAdvertisingAssociatesMbaDataFromMediaItems(
    emptyMedia({
      search: [searchLine({ grossMedia: "10.005", deliverablesAmount: "10.005" })],
    }),
  )
  assert.equal(data.totals.total_inc_gst, addGst(fromCents(toCents(10.005))))
})
