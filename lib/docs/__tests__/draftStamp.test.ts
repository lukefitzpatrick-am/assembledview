/**
 * DD-1 — DRAFT stamp primitives on MBA PDF and Media Plan workbook.
 * `draft` defaults false so existing callers stay byte-identical.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import ExcelJS from "exceljs"

import { generateMBA, type MBAData } from "../../generateMBA.js"
import {
  addKPISheet,
  generateMediaPlan,
  type KPISheetRow,
  type LineItem,
  type MediaItems,
  type MediaPlanHeader,
} from "../../generateMediaPlan.js"

const FIXED_PDF_CREATION_DATE = new Date(Date.UTC(1970, 0, 1, 0, 0, 0))
const DRAFT_MARK = "DRAFT - NOT FOR CLIENT"
const CHECKSUM = "v3 · abcd1234"

function fixtureMbaData(overrides: Partial<MBAData> = {}): MBAData {
  return {
    date: "15/09/2026",
    mba_number: "draft001",
    campaign_name: "Draft Campaign",
    campaign_brand: "Brand",
    po_number: "PO-1",
    media_plan_version: "1",
    client: {
      name: "Fixture Client",
      streetaddress: "1 Test St",
      suburb: "Melbourne",
      state: "VIC",
      postcode: "3000",
    },
    campaign: { date_start: "01/01/2026", date_end: "31/12/2026" },
    gross_media: [{ media_type: "Search", gross_amount: 100 }],
    totals: {
      gross_media: 100,
      service_fee: 10,
      production: 0,
      adserving: 0,
      totals_ex_gst: 110,
      total_inc_gst: 121,
    },
    billingSchedule: [{ monthYear: "January 2026", totalAmount: "110" }],
    checksumFooter: CHECKSUM,
    ...overrides,
  }
}

function pdfPageCount(latin1: string): number {
  const m = latin1.match(/\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/)
  return m ? Number(m[1]) : 0
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  let n = 0
  let from = 0
  while (true) {
    const i = haystack.indexOf(needle, from)
    if (i < 0) return n
    n += 1
    from = i + needle.length
  }
}

const HEADER: MediaPlanHeader = {
  logoBase64: "",
  logoWidth: 0,
  logoHeight: 0,
  client: "Test Client",
  brand: "Test Brand",
  campaignName: "Draft Workbook",
  mbaNumber: "draft001",
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

function searchLine(): LineItem {
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
  }
}

const KPI_ROW: KPISheetRow = {
  mediaType: "search",
  publisher: "Google",
  label: "Brand",
  buyType: "cpc",
  spend: 5000,
  deliverables: 1000,
  ctr: 0.02,
  vtr: null,
  cpv: null,
  conversion_rate: null,
  frequency: null,
  calculatedClicks: 20,
  calculatedViews: null,
  calculatedReach: null,
}

function worksheetHasRotatedDraft(sheet: ExcelJS.Worksheet): boolean {
  let found = false
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      const v = cell.value
      const text =
        typeof v === "string"
          ? v
          : typeof v === "number"
            ? String(v)
            : ""
      if (text.includes("DRAFT") && cell.alignment?.textRotation === 45) {
        found = true
      }
    })
  })
  return found
}

describe("generateMBA draft stamp", () => {
  it("does not change page count when draft is true", async () => {
    const published = Buffer.from(
      await (
        await generateMBA(fixtureMbaData(), FIXED_PDF_CREATION_DATE)
      ).arrayBuffer()
    ).toString("latin1")
    const draft = Buffer.from(
      await (
        await generateMBA(
          fixtureMbaData({ draft: true }),
          FIXED_PDF_CREATION_DATE
        )
      ).arrayBuffer()
    ).toString("latin1")
    assert.equal(pdfPageCount(draft), pdfPageCount(published))
    assert.ok(pdfPageCount(draft) >= 1)
  })

  it("draws DRAFT - NOT FOR CLIENT on every page and DRAFT beside the date", async () => {
    const latin1 = Buffer.from(
      await (
        await generateMBA(
          fixtureMbaData({ draft: true }),
          FIXED_PDF_CREATION_DATE
        )
      ).arrayBuffer()
    ).toString("latin1")
    const pages = pdfPageCount(latin1)
    assert.ok(pages >= 1)
    assert.ok(
      countOccurrences(latin1, DRAFT_MARK) >= pages,
      `expected stamp on all ${pages} pages`
    )
    assert.ok(latin1.includes("Date: 15/09/2026"))
    assert.ok(latin1.includes("DRAFT"))
  })

  it("does not draw the checksum footer under draft even when checksumFooter is set", async () => {
    const latin1 = Buffer.from(
      await (
        await generateMBA(
          fixtureMbaData({ draft: true, checksumFooter: CHECKSUM }),
          FIXED_PDF_CREATION_DATE
        )
      ).arrayBuffer()
    ).toString("latin1")
    assert.equal(latin1.includes(CHECKSUM), false)
    assert.equal(latin1.includes("abcd1234"), false)
  })

  it("still draws the checksum footer when draft is omitted", async () => {
    const latin1 = Buffer.from(
      await (
        await generateMBA(fixtureMbaData(), FIXED_PDF_CREATION_DATE)
      ).arrayBuffer()
    ).toString("latin1")
    assert.ok(latin1.includes(CHECKSUM))
    assert.equal(latin1.includes(DRAFT_MARK), false)
  })
})

describe("generateMediaPlan draft stamp", () => {
  it("sets header/footer on Media Plan and Campaign KPIs and writes a rotated DRAFT cell", async () => {
    const wb = await generateMediaPlan(
      HEADER,
      emptyMedia({ search: [searchLine()] }),
      undefined,
      { draft: true }
    )
    addKPISheet(wb, [KPI_ROW], { draft: true })

    const media = wb.getWorksheet("Media Plan")
    const kpis = wb.getWorksheet("Campaign KPIs")
    assert.ok(media)
    assert.ok(kpis)
    assert.equal(media.headerFooter.oddHeader, `&C&"Arial,Bold"&20${DRAFT_MARK}`)
    assert.equal(media.headerFooter.oddFooter, `&C&"Arial,Bold"&20${DRAFT_MARK}`)
    assert.equal(kpis.headerFooter.oddHeader, `&C&"Arial,Bold"&20${DRAFT_MARK}`)
    assert.equal(kpis.headerFooter.oddFooter, `&C&"Arial,Bold"&20${DRAFT_MARK}`)
    assert.ok(worksheetHasRotatedDraft(media), "Media Plan missing rotated DRAFT cell")
    assert.ok(worksheetHasRotatedDraft(kpis), "Campaign KPIs missing rotated DRAFT cell")
    assert.equal(media.getCell("G4").value, "Approved")
  })

  it("does not stamp when draft is omitted", async () => {
    const wb = await generateMediaPlan(
      HEADER,
      emptyMedia({ search: [searchLine()] })
    )
    addKPISheet(wb, [KPI_ROW])
    const media = wb.getWorksheet("Media Plan")
    const kpis = wb.getWorksheet("Campaign KPIs")
    assert.ok(media)
    assert.ok(kpis)
    assert.notEqual(
      media.headerFooter.oddHeader,
      `&C&"Arial,Bold"&20${DRAFT_MARK}`
    )
    assert.equal(worksheetHasRotatedDraft(media), false)
    assert.equal(worksheetHasRotatedDraft(kpis), false)
    assert.equal(media.getCell("G4").value, "Approved")
  })
})
