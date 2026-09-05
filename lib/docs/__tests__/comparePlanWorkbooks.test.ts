import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"

import {
  generateMediaPlan,
  type LineItem,
  type MediaItems,
  type MediaPlanHeader,
} from "@/lib/generateMediaPlan"
import {
  comparePlanWorkbooks,
  extractMediaPlanTotalsBlock,
} from "@/lib/docs/comparePlanWorkbooks"

const HEADER: MediaPlanHeader = {
  logoBase64: "",
  logoWidth: 0,
  logoHeight: 0,
  client: "Parity Client",
  brand: "Brand",
  campaignName: "Parity",
  mbaNumber: "golf002",
  clientContact: "Jane",
  planVersion: "28",
  poNumber: "PO1",
  campaignBudget: "100000",
  campaignStatus: "Approved",
  campaignStart: "01/01/2026",
  campaignEnd: "31/03/2026",
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

function searchLine(overrides: Partial<LineItem> = {}): LineItem {
  return {
    market: "National",
    platform: "Google",
    bidStrategy: "maximize_clicks",
    targeting: "Brand",
    creative: "RSA",
    buyingDemo: "All",
    buyType: "cpc",
    startDate: "2026-01-05",
    endDate: "2026-03-31",
    deliverables: 1000,
    deliverablesAmount: "5000",
    grossMedia: "5000",
    ...overrides,
  }
}

const MBA_DATA = {
  gross_media: [
    { media_type: "Search", gross_amount: 50_000 },
    { media_type: "Social Media", gross_amount: 20_000 },
    { media_type: "Programmatic Display", gross_amount: 10_000 },
  ],
  totals: {
    gross_media: 80_000,
    service_fee: 8_000,
    production: 2_000,
    adserving: 500,
    totals_ex_gst: 90_500,
    total_inc_gst: 99_550,
  },
}

async function writeWorkbook(
  dir: string,
  name: string,
  mbaData: typeof MBA_DATA,
): Promise<string> {
  const workbook = await generateMediaPlan(
    HEADER,
    emptyMedia({ search: [searchLine()] }),
    mbaData,
  )
  const path = join(dir, name)
  await workbook.xlsx.writeFile(path)
  return path
}

describe("extractMediaPlanTotalsBlock", () => {
  it("reads mbaData totals cells generateMediaPlan writes", async () => {
    const workbook = await generateMediaPlan(
      HEADER,
      emptyMedia({ search: [searchLine()] }),
      MBA_DATA,
    )
    const sheet = workbook.getWorksheet("Media Plan")
    assert.ok(sheet)
    const block = extractMediaPlanTotalsBlock(sheet)
    const byLabel = Object.fromEntries(block.map((c) => [c.label, c.value]))
    assert.equal(byLabel["Search"], 50_000)
    assert.equal(byLabel["Social Media"], 20_000)
    assert.equal(byLabel["Programmatic Display"], 10_000)
    assert.equal(byLabel["Total Gross Media:"], 80_000)
    assert.equal(byLabel["Service Fee:"], 8_000)
    assert.equal(byLabel["Production:"], 2_000)
    assert.equal(byLabel["Adserving/Tech:"], 500)
    assert.equal(byLabel["Total Ex GST:"], 90_500)
    assert.equal(byLabel["Total Inc GST:"], 99_550)
  })
})

describe("comparePlanWorkbooks", () => {
  it("reports matching sheets, row counts, and totals with empty diffs", async () => {
    const dir = mkdtempSync(join(tmpdir(), "doc3-wb-"))
    const expectedPath = await writeWorkbook(dir, "expected.xlsx", MBA_DATA)
    const actualPath = await writeWorkbook(dir, "actual.xlsx", MBA_DATA)
    const report = await comparePlanWorkbooks(expectedPath, actualPath)
    assert.equal(report.hasTotalsDiff, false)
    const media = report.sheets.find((s) => s.name === "Media Plan")
    assert.ok(media)
    assert.equal(media.presence, "both")
    assert.equal(media.expectedRowCount, media.actualRowCount)
    assert.ok(media.expectedRowCount > 0)
    const gross = media.totals.find((c) => c.label === "Total Gross Media:")
    assert.ok(gross)
    assert.equal(gross.expected, 80_000)
    assert.equal(gross.actual, 80_000)
    assert.equal(gross.diff, 0)
    assert.equal(gross.match, true)
  })

  it("exits non-zero contract: hasTotalsDiff when a totals cell diverges", async () => {
    const dir = mkdtempSync(join(tmpdir(), "doc3-wb-"))
    const expectedPath = await writeWorkbook(dir, "expected.xlsx", MBA_DATA)
    const actualPath = await writeWorkbook(dir, "actual.xlsx", {
      ...MBA_DATA,
      totals: { ...MBA_DATA.totals, service_fee: 9_000, totals_ex_gst: 91_500 },
    })
    const report = await comparePlanWorkbooks(expectedPath, actualPath)
    assert.equal(report.hasTotalsDiff, true)
    const media = report.sheets.find((s) => s.name === "Media Plan")
    assert.ok(media)
    const fee = media.totals.find((c) => c.label === "Service Fee:")
    assert.ok(fee)
    assert.equal(fee.expected, 8_000)
    assert.equal(fee.actual, 9_000)
    assert.equal(fee.diff, 1_000)
    assert.equal(fee.match, false)
  })

  it("marks a sheet present in only one workbook", async () => {
    const dir = mkdtempSync(join(tmpdir(), "doc3-wb-"))
    const expectedWb = await generateMediaPlan(
      HEADER,
      emptyMedia({ search: [searchLine()] }),
      MBA_DATA,
    )
    expectedWb.addWorksheet("Campaign KPIs")
    const expectedPath = join(dir, "expected.xlsx")
    await expectedWb.xlsx.writeFile(expectedPath)
    const actualPath = await writeWorkbook(dir, "actual.xlsx", MBA_DATA)
    const report = await comparePlanWorkbooks(expectedPath, actualPath)
    const kpi = report.sheets.find((s) => s.name === "Campaign KPIs")
    assert.ok(kpi)
    assert.equal(kpi.presence, "expected_only")
    assert.equal(report.hasTotalsDiff, false)
  })
})
