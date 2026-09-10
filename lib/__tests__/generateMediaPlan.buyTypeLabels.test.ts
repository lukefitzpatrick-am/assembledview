import assert from "node:assert/strict"
import test from "node:test"
import type ExcelJS from "exceljs"

import {
  generateMediaPlan,
  type LineItem,
  type MediaItems,
  type MediaPlanHeader,
} from "@/lib/generateMediaPlan"
import type { BuyType } from "@/lib/mediaplan/deliverableBudget"
import { BUY_TYPE_UI_LABELS } from "@/lib/mediaplan/buyTypeLabels"
import {
  BVOD_BUY_TYPE_OPTIONS,
  CINEMA_BUY_TYPE_OPTIONS,
  DIGIAUDIO_BUY_TYPE_OPTIONS,
  DIGITALDISPLAY_BUY_TYPE_OPTIONS,
  DIGIVIDEO_BUY_TYPE_OPTIONS,
  INFLUENCERS_BUY_TYPE_OPTIONS,
  INTEGRATION_BUY_TYPE_OPTIONS,
  MAGAZINES_BUY_TYPE_OPTIONS,
  NEWSPAPER_BUY_TYPE_OPTIONS,
  OOH_BUY_TYPE_OPTIONS,
  PROGAUDIO_BUY_TYPE_OPTIONS,
  PROGBVOD_BUY_TYPE_OPTIONS,
  PROGDISPLAY_BUY_TYPE_OPTIONS,
  PROGOOH_BUY_TYPE_OPTIONS,
  PROGVIDEO_BUY_TYPE_OPTIONS,
  RADIO_BUY_TYPE_OPTIONS,
  SEARCH_BUY_TYPE_OPTIONS,
  SOCIALMEDIA_BUY_TYPE_OPTIONS,
  TV_BUY_TYPE_OPTIONS,
} from "@/lib/mediaplan/expertGridChannelConfig"

const HEADER: MediaPlanHeader = {
  logoBase64: "",
  logoWidth: 0,
  logoHeight: 0,
  client: "Test Client",
  brand: "Test Brand",
  campaignName: "Buy Type Labels",
  mbaNumber: "MBA0001",
  clientContact: "Jane",
  planVersion: "1",
  poNumber: "PO1",
  campaignBudget: "100000",
  campaignStatus: "Approved",
  campaignStart: "01/01/2026",
  campaignEnd: "31/01/2026",
}

const ALL_BUY_TYPES = Object.keys(BUY_TYPE_UI_LABELS) as BuyType[]

const PLANNER_BUY_TYPE_OPTION_LISTS = [
  SEARCH_BUY_TYPE_OPTIONS,
  PROGVIDEO_BUY_TYPE_OPTIONS,
  PROGDISPLAY_BUY_TYPE_OPTIONS,
  PROGAUDIO_BUY_TYPE_OPTIONS,
  PROGBVOD_BUY_TYPE_OPTIONS,
  PROGOOH_BUY_TYPE_OPTIONS,
  SOCIALMEDIA_BUY_TYPE_OPTIONS,
  OOH_BUY_TYPE_OPTIONS,
  DIGITALDISPLAY_BUY_TYPE_OPTIONS,
  DIGIVIDEO_BUY_TYPE_OPTIONS,
  DIGIAUDIO_BUY_TYPE_OPTIONS,
  BVOD_BUY_TYPE_OPTIONS,
  TV_BUY_TYPE_OPTIONS,
  RADIO_BUY_TYPE_OPTIONS,
  CINEMA_BUY_TYPE_OPTIONS,
  NEWSPAPER_BUY_TYPE_OPTIONS,
  MAGAZINES_BUY_TYPE_OPTIONS,
  INFLUENCERS_BUY_TYPE_OPTIONS,
  INTEGRATION_BUY_TYPE_OPTIONS,
]

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
    startDate: "2026-01-05",
    endDate: "2026-01-31",
    deliverables: 1000,
    deliverablesAmount: "5000",
    grossMedia: "5000",
    ...overrides,
  }
}

function mediaPlanSheet(wb: ExcelJS.Workbook): ExcelJS.Worksheet {
  const sheet = wb.getWorksheet("Media Plan")
  assert.ok(sheet, "expected Media Plan worksheet")
  return sheet
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return ""
  if (typeof value === "string" || typeof value === "number") return String(value)
  if (typeof value === "object" && "text" in value && typeof value.text === "string") {
    return value.text
  }
  if (typeof value === "object" && "richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((p) => p.text).join("")
  }
  return String(value)
}

function buyTypeCellForTargeting(sheet: ExcelJS.Worksheet, targeting: string): string {
  let found: string | null = null
  sheet.eachRow((row) => {
    if (cellText(row.getCell(5).value) === targeting) {
      found = cellText(row.getCell(12).value)
    }
  })
  assert.ok(found != null, `expected a Search row with targeting ${targeting}`)
  return found
}

test("planner Buy Type option labels match BUY_TYPE_UI_LABELS", () => {
  for (const options of PLANNER_BUY_TYPE_OPTION_LISTS) {
    for (const option of options) {
      if (!(option.value in BUY_TYPE_UI_LABELS)) continue
      assert.equal(
        BUY_TYPE_UI_LABELS[option.value as BuyType],
        option.label,
        `${option.value} UI label drifted from expert-grid options`,
      )
    }
  }
})

test("package_inclusions UI label is Package Inclusions", () => {
  const option = SEARCH_BUY_TYPE_OPTIONS.find((o) => o.value === "package_inclusions")
  assert.equal(option?.label, "Package Inclusions")
  assert.equal(BUY_TYPE_UI_LABELS.package_inclusions, option!.label)
})

test("Excel Buy Type column matches the UI label for every BuyType", async () => {
  const workbook = await generateMediaPlan(
    HEADER,
    emptyMedia({
      search: ALL_BUY_TYPES.map((buyType, i) =>
        searchLine({
          line_item_id: `SE${i + 1}`,
          lineItemId: `SE${i + 1}`,
          targeting: `buy-${buyType}`,
          buyType,
        }),
      ),
    }),
  )
  const sheet = mediaPlanSheet(workbook)

  assert.equal(ALL_BUY_TYPES.length, 20, "one assertion per BuyType union member")

  assert.equal(
    buyTypeCellForTargeting(sheet, "buy-package"),
    BUY_TYPE_UI_LABELS.package,
    "package",
  )
  assert.equal(
    buyTypeCellForTargeting(sheet, "buy-spots"),
    BUY_TYPE_UI_LABELS.spots,
    "spots",
  )
  assert.equal(
    buyTypeCellForTargeting(sheet, "buy-cpt"),
    BUY_TYPE_UI_LABELS.cpt,
    "cpt",
  )
  assert.equal(
    buyTypeCellForTargeting(sheet, "buy-cpp"),
    BUY_TYPE_UI_LABELS.cpp,
    "cpp",
  )
  assert.equal(
    buyTypeCellForTargeting(sheet, "buy-panels"),
    BUY_TYPE_UI_LABELS.panels,
    "panels",
  )
  assert.equal(
    buyTypeCellForTargeting(sheet, "buy-insertions"),
    BUY_TYPE_UI_LABELS.insertions,
    "insertions",
  )
  assert.equal(
    buyTypeCellForTargeting(sheet, "buy-cpm"),
    BUY_TYPE_UI_LABELS.cpm,
    "cpm",
  )
  assert.equal(
    buyTypeCellForTargeting(sheet, "buy-cpc"),
    BUY_TYPE_UI_LABELS.cpc,
    "cpc",
  )
  assert.equal(
    buyTypeCellForTargeting(sheet, "buy-guaranteed_leads"),
    BUY_TYPE_UI_LABELS.guaranteed_leads,
    "guaranteed_leads",
  )
  assert.equal(
    buyTypeCellForTargeting(sheet, "buy-screens"),
    BUY_TYPE_UI_LABELS.screens,
    "screens",
  )
  assert.equal(
    buyTypeCellForTargeting(sheet, "buy-cpcv"),
    BUY_TYPE_UI_LABELS.cpcv,
    "cpcv",
  )
  assert.equal(
    buyTypeCellForTargeting(sheet, "buy-cpi"),
    BUY_TYPE_UI_LABELS.cpi,
    "cpi",
  )
  assert.equal(
    buyTypeCellForTargeting(sheet, "buy-cps"),
    BUY_TYPE_UI_LABELS.cps,
    "cps",
  )
  assert.equal(
    buyTypeCellForTargeting(sheet, "buy-cpv"),
    BUY_TYPE_UI_LABELS.cpv,
    "cpv",
  )
  assert.equal(
    buyTypeCellForTargeting(sheet, "buy-fixed_cost"),
    BUY_TYPE_UI_LABELS.fixed_cost,
    "fixed_cost",
  )
  assert.equal(
    buyTypeCellForTargeting(sheet, "buy-weekly_rate"),
    BUY_TYPE_UI_LABELS.weekly_rate,
    "weekly_rate",
  )
  assert.equal(
    buyTypeCellForTargeting(sheet, "buy-monthly_rate"),
    BUY_TYPE_UI_LABELS.monthly_rate,
    "monthly_rate",
  )
  assert.equal(
    buyTypeCellForTargeting(sheet, "buy-package_inclusions"),
    BUY_TYPE_UI_LABELS.package_inclusions,
    "package_inclusions",
  )
  assert.equal(
    buyTypeCellForTargeting(sheet, "buy-bonus"),
    BUY_TYPE_UI_LABELS.bonus,
    "bonus",
  )
  assert.equal(
    buyTypeCellForTargeting(sheet, "buy-production"),
    BUY_TYPE_UI_LABELS.production,
    "production",
  )
})
