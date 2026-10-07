import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

import ExcelJS from "exceljs"

import {
  buildMediaPlanWorkbook,
  mediaPlanFileName,
} from "../mediaPlanWorkbook.js"
import type { KPISheetRow, MediaItems, MediaPlanHeader } from "@/lib/generateMediaPlan"

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
  campaignStatus: "Approved",
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
  publisher: "Google",
  label: "Brand",
  buyType: "cpc",
  spend: 1000,
  deliverables: 100,
  ctr: 0.01,
  vtr: null,
  cpv: null,
  conversion_rate: null,
  frequency: null,
  calculatedClicks: null,
  calculatedViews: null,
  calculatedReach: null,
}

test("filenames follow the published and draft patterns", () => {
  assert.equal(
    mediaPlanFileName({
      clientName: "Acme",
      campaignName: "Spring push",
      versionNumber: 3,
      variant: "standard",
      draft: false,
    }),
    "Acme-MediaPlan_Spring push-v3.xlsx",
  )
  assert.equal(
    mediaPlanFileName({
      clientName: "Acme",
      campaignName: "Spring push",
      versionNumber: 3,
      variant: "aa",
      draft: false,
    }),
    "AA - Acme-MediaPlan_Spring push-v3.xlsx",
  )
  assert.equal(
    mediaPlanFileName({
      clientName: "Acme",
      campaignName: "Spring push",
      versionNumber: 3,
      variant: "standard",
      draft: true,
    }),
    "DRAFT-MediaPlan_Spring_push_not-for-client.xlsx",
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
    kpiRows: [kpi],
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

  assert.equal(publishedWb.getWorksheet("Campaign KPIs") != null, true)
  assert.equal(draftWb.getWorksheet("Campaign KPIs") != null, true)
  assert.equal(aaWb.getWorksheet("Campaign KPIs"), undefined)

  const publishedSheet = publishedWb.getWorksheet("Media Plan")
  const draftSheet = draftWb.getWorksheet("Media Plan")
  assert.equal(String(draftSheet?.headerFooter?.oddHeader ?? "").includes("DRAFT - NOT FOR CLIENT"), true)
  assert.equal(String(publishedSheet?.headerFooter?.oddHeader ?? "").includes("DRAFT - NOT FOR CLIENT"), false)
  assert.equal(draftSheet?.getCell(1, 1).value, "DRAFT")
})
